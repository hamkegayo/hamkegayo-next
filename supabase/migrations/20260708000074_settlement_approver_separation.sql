-- #56: 승인 담당자와 이체 파일/지급 결과 담당자의 직접 분리. 전체 관리자도 동일 기준.
alter table public.settlements add column approved_by uuid;
comment on column public.settlements.approved_by is '승인 RPC의 인증된 담당자 UUID. 계정 삭제 뒤에도 거래 감사 기준으로 보존.';
update public.settlements st set approved_by=(
 select l.actor_id from public.access_logs l
 where l.action='SETTLEMENT_APPROVE' and l.target_table='settlements' and l.target_id=st.id
 order by l.occurred_at desc,l.id desc limit 1
) where st.status in ('APPROVED','PAID');
create or replace function public.admin_approve_settlements(
  p_ids uuid[], p_reason text
)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_count integer := 0; v_partner uuid;
begin
  if not public.can_manage_settlements() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(array_length(p_ids, 1), 0) < 1 or coalesce(array_length(p_ids, 1), 0) > 200
     or length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  foreach v_id in array p_ids loop
    select st.partner_id into v_partner
      from public.settlements st
      join public.services sv on sv.id = st.service_id
      left join public.payments pay on pay.id = st.payment_id
     where st.id = v_id
       and st.status = 'PENDING'::public.settlement_status
       and sv.status = 'COMPLETED'::public.service_status
       and public.settlement_payment_ready(st.id)
       and exists (
         select 1 from public.partner_payouts pp where pp.partner_id = st.partner_id
       )
     for update of st;
    if v_partner is null then
      raise exception 'settlement_not_approvable' using errcode = '23514';
    end if;
    update public.settlements
       set status = 'APPROVED'::public.settlement_status,
           confirmed_at = now(), approved_by = auth.uid()
     where id = v_id;
    perform public.log_access(
      'SETTLEMENT_APPROVE', 'settlements', v_id, v_partner, btrim(p_reason)
    );
    v_count := v_count + 1;
    v_partner := null;
  end loop;
  return v_count;
end;
$$;
-- 기존 배치/정산 행 잠금 순서(68)와 상태/PAID/생성자 분리를 유지한다.
alter function public.admin_issue_transfer_file(uuid,text) rename to admin_issue_transfer_file_before_approver_guard;
revoke all on function public.admin_issue_transfer_file_before_approver_guard(uuid,text) from public,anon,authenticated,service_role;
create function public.admin_issue_transfer_file(p_batch_id uuid,p_reason text)
returns table(batch_code text,item_id uuid,bank_code text,bank_name text,account_number text,holder_name text,amount integer,memo text)
language plpgsql security definer set search_path='' as $$
begin
  if not public.can_manage_settlements() then raise exception 'forbidden' using errcode='42501'; end if;
  perform 1 from public.transfer_batches where id=p_batch_id for update;
  perform st.id from public.settlements st join public.transfer_batch_settlements bs on bs.settlement_id=st.id
    where bs.batch_id=p_batch_id order by st.id for update of st;
  if exists(select 1 from public.settlements st join public.transfer_batch_settlements bs on bs.settlement_id=st.id
    where bs.batch_id=p_batch_id and st.status='APPROVED' and (st.approved_by is null or st.approved_by=auth.uid())) then
    raise exception 'independent_approver_required' using errcode='42501';
  end if;
  return query select * from public.admin_issue_transfer_file_before_approver_guard(p_batch_id,p_reason);
end $$;
revoke all on function public.admin_issue_transfer_file(uuid,text) from public,anon;
grant execute on function public.admin_issue_transfer_file(uuid,text) to authenticated;

alter function public.admin_record_transfer_result(uuid,text,text,text) rename to admin_record_transfer_result_before_approver_guard;
revoke all on function public.admin_record_transfer_result_before_approver_guard(uuid,text,text,text) from public,anon,authenticated,service_role;
create function public.admin_record_transfer_result(p_batch_id uuid,p_status text,p_reference text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.can_manage_settlements() then raise exception 'forbidden' using errcode='42501'; end if;
  perform 1 from public.transfer_batches where id=p_batch_id for update;
  perform st.id from public.settlements st join public.transfer_batch_settlements bs on bs.settlement_id=st.id
    where bs.batch_id=p_batch_id order by st.id for update of st;
  if p_status='COMPLETED' and exists(select 1 from public.settlements st join public.transfer_batch_settlements bs on bs.settlement_id=st.id
    where bs.batch_id=p_batch_id and st.status='APPROVED' and (st.approved_by is null or st.approved_by=auth.uid())) then
    raise exception 'independent_approver_required' using errcode='42501';
  end if;
  perform public.admin_record_transfer_result_before_approver_guard(p_batch_id,p_status,p_reference,p_reason);
end $$;
revoke all on function public.admin_record_transfer_result(uuid,text,text,text) from public,anon;
grant execute on function public.admin_record_transfer_result(uuid,text,text,text) to authenticated;
