-- #185: 예외 종료는 청구/정산 자동 확정 전에 운영 확인이 필요하다.
-- 최종 면제·환불·파트너 지급 기준을 임의로 정하지 않는다.
alter table public.services add column termination_kind text not null default 'NORMAL'
 check(termination_kind in ('NORMAL','CUSTOMER_EARLY','PROVIDER_FAULT','EMERGENCY'));

create function public.end_service_exception(p_service_id uuid,p_kind text,p_memo text default null)
returns void language plpgsql security definer set search_path='' as $$
declare s public.services;
begin
 select * into s from public.services where id=p_service_id for update;
 if s.id is null then raise exception 'service_not_found'; end if;
 if s.partner_id is distinct from auth.uid() or not exists(select 1 from public.profiles where id=auth.uid() and role='PARTNER' and status='ACTIVE') then raise exception 'not_partner'; end if;
 if s.status<>'IN_PROGRESS' or p_kind is null or p_kind not in ('PROVIDER_FAULT','EMERGENCY') then raise exception 'invalid_state'; end if;
 if char_length(coalesce(p_memo,''))>1000 then raise exception 'memo_too_long'; end if;
 update public.services set termination_kind=p_kind,status='ENDED',ended_at=now(),end_memo=p_memo where id=s.id;
 insert into public.notifications(recipient_id,type,title,body,link)
 select customer_id,'SERVICE_EXCEPTION_REVIEW','서비스 종료 내용을 확인하고 있어요','운영 담당자가 종료 사유와 이용 내역을 확인한 뒤 결제·환불 내용을 안내해 드립니다.','/mypage/reservations/'||s.reservation_id::text from public.reservations where id=s.reservation_id;
end; $$;
revoke all on function public.end_service_exception(uuid,text,text) from public,anon;
grant execute on function public.end_service_exception(uuid,text,text) to authenticated;

create function public.end_service_classified(p_service_id uuid,p_kind text,p_memo text default null)
returns void language plpgsql security definer set search_path='' as $$ begin
 if p_kind is null or p_kind not in ('NORMAL','CUSTOMER_EARLY') then raise exception 'invalid_kind'; end if;
 perform public.end_service(p_service_id,p_memo);
 update public.services set termination_kind=p_kind where id=p_service_id;
end; $$;
revoke all on function public.end_service_classified(uuid,text,text) from public,anon;
grant execute on function public.end_service_classified(uuid,text,text) to authenticated;

create function public.guard_service_exception_complete() returns trigger language plpgsql set search_path='' as $$ begin
 if new.status='COMPLETED' and new.termination_kind in ('PROVIDER_FAULT','EMERGENCY') then raise exception 'exception_review_pending'; end if;
 return new;
end; $$;
create trigger service_exception_complete before update on public.services for each row execute function public.guard_service_exception_complete();

create function public.guard_service_exception_money() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if (new.type='EXTENSION' or new.type='REFUND') and exists(select 1 from public.services s where s.reservation_id=new.reservation_id and s.termination_kind in ('PROVIDER_FAULT','EMERGENCY')) then raise exception 'exception_review_pending'; end if;
 return new;
end; $$;
create trigger service_exception_money before insert or update on public.payments for each row execute function public.guard_service_exception_money();

create function public.guard_service_exception_settlement() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.status='APPROVED' and exists(select 1 from public.services s where s.id=new.service_id and s.termination_kind in ('PROVIDER_FAULT','EMERGENCY')) then raise exception 'exception_review_pending'; end if;
 return new;
end; $$;
create trigger service_exception_settlement before insert or update on public.settlements for each row execute function public.guard_service_exception_settlement();

create function public.admin_list_service_exceptions()
returns table(service_id uuid,reservation_code text,kind text,ended_at timestamptz)
language plpgsql security definer set search_path='' as $$ begin
 if not public.can_manage_settlements() then raise exception 'forbidden' using errcode='42501'; end if;
 perform public.log_access('SERVICE_EXCEPTION_LIST','services',null,null,'예외 종료 운영 확인');
 return query select s.id,r.code,s.termination_kind,s.ended_at from public.services s join public.reservations r on r.id=s.reservation_id where s.termination_kind in ('PROVIDER_FAULT','EMERGENCY') order by s.ended_at limit 100;
end; $$;
revoke all on function public.admin_list_service_exceptions() from public,anon;
grant execute on function public.admin_list_service_exceptions() to authenticated;
revoke all on function public.guard_service_exception_complete(),public.guard_service_exception_money(),public.guard_service_exception_settlement() from public,anon,authenticated;
