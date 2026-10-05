-- PR #177 재리뷰: 실제 은행 결과를 기록하고 계좌 원문 파기를 완료하는 경로.
-- 개인정보처리방침 제4조·제11조: 목적 달성 후 원문 파기, 거래 이력만 보존.
-- 송금 API가 아니다. 담당자가 전건 성공/전건 미지급을 확인한 뒤 기록한다.
create table public.transfer_batch_results (
  batch_id uuid primary key references public.transfer_batches(id) on delete cascade,
  status public.transfer_batch_status not null check (status in ('COMPLETED', 'CANCELLED')),
  recorded_by uuid not null references public.profiles(id),
  recorded_at timestamptz not null default now(),
  reference text not null check (length(btrim(reference)) between 5 and 200),
  reason text not null check (length(btrim(reason)) between 5 and 500),
  settlement_ids uuid[] not null
);
alter table public.transfer_batch_results enable row level security;
revoke all on public.transfer_batch_results from public, anon, authenticated;
grant select, insert on public.transfer_batch_results to service_role;

create function public.admin_record_transfer_result(
  p_batch_id uuid, p_status text, p_reference text, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_batch public.transfer_batches; v_ids uuid[]; v_count integer; v_total integer;
begin
  if not public.can_manage_settlements() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('COMPLETED', 'CANCELLED')
     or length(btrim(coalesce(p_reference, ''))) not between 5 and 200
     or length(btrim(coalesce(p_reason, ''))) not between 5 and 500 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select * into v_batch from public.transfer_batches where id = p_batch_id for update;
  if not found then raise exception 'batch_not_found' using errcode = 'P0002'; end if;
  if v_batch.status not in ('DRAFT', 'FILE_ISSUED')
     or (p_status = 'COMPLETED' and v_batch.status <> 'FILE_ISSUED') then
    raise exception 'batch_not_recordable' using errcode = '23514';
  end if;
  perform 1 from public.settlements st
    join public.transfer_batch_settlements bs on bs.settlement_id = st.id
    where bs.batch_id = p_batch_id order by st.id for update of st;
  select array_agg(st.id order by st.id), count(*), sum(st.net)::integer
    into v_ids, v_count, v_total from public.settlements st
    join public.transfer_batch_settlements bs on bs.settlement_id = st.id
    where bs.batch_id = p_batch_id;
  if v_count <> v_batch.settlement_count or v_total is distinct from v_batch.total_net
     or exists (select 1 from public.settlements st where st.id = any(v_ids)
       and (st.status <> 'APPROVED' or (p_status = 'COMPLETED' and not public.settlement_payment_ready(st.id)))) then
    raise exception 'settlement_not_recordable' using errcode = '23514';
  end if;
  insert into public.transfer_batch_results(batch_id, status, recorded_by, reference, reason, settlement_ids)
    values (p_batch_id, p_status::public.transfer_batch_status, auth.uid(), btrim(p_reference), btrim(p_reason), v_ids);
  if p_status = 'COMPLETED' then
    update public.settlements set status = 'PAID', paid_at = now(), settled_at = now() where id = any(v_ids);
  else
    -- 미지급 취소 건은 재편입 가능. 원래 연결은 결과 이력의 UUID 배열에 보존한다.
    delete from public.transfer_batch_settlements where batch_id = p_batch_id;
  end if;
  update public.transfer_batches set status = p_status::public.transfer_batch_status where id = p_batch_id;
  -- 마이그레이션 62의 트리거가 같은 트랜잭션에서 account_number를 NULL로 만든다.
  perform public.log_access('TRANSFER_RESULT_RECORD', 'transfer_batches', p_batch_id, null,
    p_status || ' / ' || btrim(p_reference) || ' / ' || btrim(p_reason));
end;
$$;
revoke all on function public.admin_record_transfer_result(uuid,text,text,text) from public, anon;
grant execute on function public.admin_record_transfer_result(uuid,text,text,text) to authenticated;

create function public.admin_get_transfer_result(p_batch_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not public.can_manage_settlements() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform public.log_access('TRANSFER_RESULT_VIEW', 'transfer_batches', p_batch_id, null, null);
  select jsonb_build_object('status', r.status, 'reference', r.reference, 'reason', r.reason,
    'recordedAt', r.recorded_at, 'recordedBy', p.name) into v_result
    from public.transfer_batch_results r join public.profiles p on p.id = r.recorded_by
    where r.batch_id = p_batch_id;
  return v_result;
end;
$$;
revoke all on function public.admin_get_transfer_result(uuid) from public, anon;
grant execute on function public.admin_get_transfer_result(uuid) to authenticated;
