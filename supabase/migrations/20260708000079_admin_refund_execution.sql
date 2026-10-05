-- #80: 승인/PG 취소 선점과 결과 재조회. 불확정 결과에서는 PG 재취소 금지.
create table public.refund_executions (
 request_id uuid primary key references public.refund_requests(id) on delete cascade,
 actor_id uuid not null references public.profiles(id),
 reason text not null check(char_length(reason) between 5 and 500),
 transaction_id text not null,
 balance_before integer not null check(balance_before>0),
 amount integer not null check(amount>0 and amount<=balance_before),
 pg_verified boolean not null default false,
 created_at timestamptz not null default now(), verified_at timestamptz,
 notification_recorded_at timestamptz
);
alter table public.refund_executions enable row level security;
revoke all on public.refund_executions from anon,authenticated;

create function public.admin_refund_queue() returns table(id uuid,code text,amount integer,status text,claimed boolean)
language plpgsql security definer set search_path='' as $$ begin
 if not public.can_manage_settlements() then raise exception 'forbidden' using errcode='42501'; end if;
 perform public.log_access('REFUND_QUEUE','refund_requests',null,null,'환불 승인 대기 조회');
 return query select q.id,r.code,q.amount,q.status::text,exists(select 1 from public.refund_executions x where x.request_id=q.id)
 from public.refund_requests q join public.reservations r on r.id=q.reservation_id
 where q.status in ('PENDING','APPROVED') order by q.requested_at limit 200;
end; $$;

create function public.admin_prepare_refund(p_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q public.refund_requests; p public.payments; s public.services; x public.refund_executions;
begin
 if not public.can_manage_settlements() then raise exception 'forbidden' using errcode='42501'; end if;
 if p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then raise exception 'reason_required'; end if;
 select * into q from public.refund_requests where id=p_id;
 select * into p from public.payments where id=q.payment_id;
 select * into s from public.services where reservation_id=q.reservation_id;
 if q.id is null or q.status not in ('PENDING','APPROVED') or p.status<>'PAID' or p.type<>'BASE'
 or p.transaction_id is null or s.id is null or s.status not in ('ENDED','COMPLETED')
 or coalesce(to_jsonb(s)->>'termination_kind','NORMAL') in ('PROVIDER_FAULT','EMERGENCY') then raise exception 'not_actionable'; end if;
 select * into x from public.refund_executions where request_id=q.id;
 perform public.log_access('REFUND_PREPARE','refund_requests',q.id,null,trim(p_reason));
 return jsonb_build_object('requestId',q.id,'paymentId',p.id,'orderId',p.order_id,'transactionId',p.transaction_id,
 'amount',q.amount,'cash',p.gross_amount-p.discount_amount,'claimed',x.request_id is not null,
 'balanceBefore',x.balance_before,'status',q.status,'verified',x.pg_verified);
end; $$;

create function public.admin_claim_refund(p_id uuid,p_reason text,p_balance integer,p_tid text) returns void
language plpgsql security definer set search_path='' as $$
declare d jsonb; q public.refund_requests;
begin
 select * into q from public.refund_requests where id=p_id for update;
 d:=public.admin_prepare_refund(p_id,p_reason);
 if q.status<>'PENDING' or (d->>'claimed')::boolean then raise exception 'already_claimed_check_pg'; end if;
 -- 원거래 잔액이 완전한 첫 환불만 자동 집행. 기존 부분환불/레거시 승인건은 수동 대조.
 if p_balance is null or p_balance<>(d->>'cash')::integer or p_tid is distinct from d->>'transactionId'
 or q.amount>p_balance then raise exception 'pg_mismatch'; end if;
 insert into public.refund_executions(request_id,actor_id,reason,transaction_id,balance_before,amount)
 values(q.id,auth.uid(),trim(p_reason),p_tid,p_balance,q.amount);
 update public.refund_requests set status='APPROVED',decided_by=auth.uid(),decided_at=now(),decided_memo=trim(p_reason) where id=q.id;
 perform public.log_access('REFUND_EXECUTION_CLAIM','refund_requests',q.id,null,trim(p_reason));
end; $$;

create function public.record_verified_refund(p_id uuid,p_balance integer,p_tid text,p_raw jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare x public.refund_executions; result jsonb; recipient uuid; reservation uuid;
begin
 select * into x from public.refund_executions where request_id=p_id for update;
 if x.request_id is null or p_tid is distinct from x.transaction_id or p_balance is distinct from x.balance_before-x.amount then raise exception 'pg_not_verified'; end if;
 update public.refund_executions set pg_verified=true,verified_at=coalesce(verified_at,now()) where request_id=p_id;
 result:=public.record_settlement_refund(p_id,p_raw);
 -- 원장과 알림을 함께 커밋한다. already=true인 복구에도 누락된 알림을 적재한다.
 -- 요청 행 잠금 + 기존 알림 중복키 + 기록 시각으로 재조회/동시 요청을 중복 없이 처리.
 if x.notification_recorded_at is null then
  select r.customer_id,r.id into recipient,reservation from public.refund_requests q
    join public.reservations r on r.id=q.reservation_id where q.id=p_id;
  if not found then raise exception 'notification_recipient_missing'; end if;
  insert into public.notifications(recipient_id,type,title,body,link,dedupe_key)
  values(recipient,'PAYMENT_REFUND','환불이 완료되었어요',
    to_char(x.amount,'FM999,999,999,990')||'원이 환불되었습니다. 결제수단에 따라 반영까지 며칠 걸릴 수 있습니다.',
    '/mypage/reservations/'||reservation::text,'settlement-refund-completed:'||p_id::text)
  on conflict(recipient_id,dedupe_key) do nothing;
  update public.refund_executions set notification_recorded_at=now() where request_id=p_id;
 end if;
 insert into public.access_logs(actor_id,actor_role,action,target_table,target_id,reason)
 values(x.actor_id,'ADMIN','REFUND_EXECUTION_VERIFIED','refund_requests',p_id,x.reason);
 return result;
end; $$;
revoke all on function public.admin_refund_queue() from public,anon;
revoke all on function public.admin_prepare_refund(uuid,text) from public,anon;
revoke all on function public.admin_claim_refund(uuid,text,integer,text) from public,anon;
grant execute on function public.admin_refund_queue(), public.admin_prepare_refund(uuid,text),public.admin_claim_refund(uuid,text,integer,text) to authenticated;
revoke all on function public.record_verified_refund(uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_verified_refund(uuid,integer,text,jsonb) to service_role;
