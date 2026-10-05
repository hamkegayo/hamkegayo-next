-- #80: 확정 실패 후 남은 미기록 승인 거래의 전액 취소.
-- 정상 이용/부분환불은 기존 환불 경로를 유지한다. 권한·MFA·감사 필수.
create table public.payment_incident_cancellations (
  payment_id uuid primary key references public.payments(id) on delete cascade,
  incident_id uuid not null references public.payment_incidents(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  reason text not null check (char_length(reason) between 5 and 500),
  status text not null default 'CHECKING' check (status in ('CHECKING','UNKNOWN','COMPLETED')),
  amount integer not null,
  transaction_id text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.payment_incident_cancellations enable row level security;
revoke all on public.payment_incident_cancellations from anon,authenticated;

create function public.admin_claim_incident_cancel(p_incident uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.payment_incidents; p public.payments; c public.payment_incident_cancellations;
begin
  if not public.can_manage_settlements() then raise exception 'forbidden' using errcode='42501'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then raise exception 'reason_required'; end if;
  select * into v from public.payment_incidents where id=p_incident for update;
  if v.id is null or v.status='RESOLVED' or v.kind::text not in ('CANCEL_FAILED','APPROVE_INDETERMINATE','STATE_MISMATCH') then raise exception 'not_actionable'; end if;
  select * into p from public.payments where id=v.payment_id for update;
  if p.id is null or p.type='REFUND' or p.status not in ('FAILED','CANCELLED')
    or exists(select 1 from public.services where reservation_id=p.reservation_id)
    or exists(select 1 from public.payments where reservation_id=p.reservation_id and status='PAID')
    or exists(select 1 from public.settlements where payment_id=p.id) then raise exception 'use_standard_refund'; end if;
  select * into c from public.payment_incident_cancellations where payment_id=p.id for update;
  if c.payment_id is not null then raise exception 'cancel_already_claimed_check_pg'; end if;
  insert into public.payment_incident_cancellations(payment_id,incident_id,actor_id,reason,amount)
    values(p.id,v.id,auth.uid(),trim(p_reason),p.gross_amount-p.discount_amount);
  perform public.log_access('INCIDENT_CANCEL_CLAIM','payment_incidents',v.id,null,trim(p_reason));
  return jsonb_build_object('paymentId',p.id,'orderId',p.order_id,'amount',p.gross_amount-p.discount_amount);
end; $$;

create function public.record_incident_cancel(p_payment uuid,p_completed boolean,p_tid text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.payment_incident_cancellations;
begin
 select * into c from public.payment_incident_cancellations where payment_id=p_payment for update;
 if c.payment_id is null then raise exception 'claim_required'; end if;
 if c.status='COMPLETED' then return; end if;
 if p_completed then
   update public.payments set status='CANCELLED',pay_token=null,token_expires_at=null where id=p_payment and status in ('FAILED','CANCELLED');
   if not found then raise exception 'payment_changed'; end if;
 end if;
 update public.payment_incident_cancellations set status=case when p_completed then 'COMPLETED' else 'UNKNOWN' end,
   transaction_id=p_tid, completed_at=case when p_completed then now() else null end where payment_id=p_payment;
 -- 실제 처리자 식별값은 claim 원장에 기록. 사고는 고객 안내 후 관리자가 별도 완료 처리한다.
 insert into public.access_logs(actor_id,actor_role,action,target_table,target_id,reason)
   values(c.actor_id,'ADMIN',case when p_completed then 'INCIDENT_CANCEL_COMPLETED' else 'INCIDENT_CANCEL_UNKNOWN' end,'payment_incidents',c.incident_id,c.reason);
end; $$;
revoke all on function public.admin_claim_incident_cancel(uuid,text) from public,anon;
grant execute on function public.admin_claim_incident_cancel(uuid,text) to authenticated;
revoke all on function public.record_incident_cancel(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.record_incident_cancel(uuid,boolean,text) to service_role;

create function public.admin_inspect_incident_cancel(p_incident uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.payment_incident_cancellations; v_order text;
begin
 if not public.can_manage_settlements() then raise exception 'forbidden' using errcode='42501'; end if;
 select * into c from public.payment_incident_cancellations where incident_id=p_incident;
 if c.payment_id is null then raise exception 'claim_required'; end if;
 select order_id into v_order from public.payments where id=c.payment_id;
 perform public.log_access('INCIDENT_CANCEL_INSPECT','payment_incidents',p_incident,null,'PG 원거래 상태 재조회');
 return jsonb_build_object('paymentId',c.payment_id,'orderId',v_order,'amount',c.amount,'status',c.status);
end; $$;
revoke all on function public.admin_inspect_incident_cancel(uuid) from public,anon;
grant execute on function public.admin_inspect_incident_cancel(uuid) to authenticated;
