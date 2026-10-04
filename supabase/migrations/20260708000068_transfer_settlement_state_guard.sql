-- PR #177 ??: ?? ??? CSV ??, ?? ?? ? ??/?? ??.
-- ?? ?? ??? 56/57/61/67? ???? ?? ?? RPC? ????.
-- ?? ??? ???? ??? ?? ???PAID ??? CSV ????? ????.

create or replace function public.admin_hold_settlements(
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
  -- ?? ??? ??? ??? ?? ?, ?? ???? ?? ?? ??? ????.
  perform st.id from public.settlements st
   where st.id = any(p_ids) order by st.id for update;
  foreach v_id in array p_ids loop
    update public.settlements st
       set status = 'HOLD'::public.settlement_status, confirmed_at = null
     where st.id = v_id
       and st.status in (
         'PENDING'::public.settlement_status, 'APPROVED'::public.settlement_status
       )
       and not exists (
         select 1
           from public.transfer_batch_settlements tbs
           join public.transfer_batches tb on tb.id = tbs.batch_id
          where tbs.settlement_id = st.id
            and tb.status <> 'CANCELLED'::public.transfer_batch_status
       )
     returning st.partner_id into v_partner;
    if v_partner is null then
      raise exception 'settlement_not_holdable' using errcode = '23514';
    end if;
    perform public.log_access(
      'SETTLEMENT_HOLD', 'settlements', v_id, v_partner, btrim(p_reason)
    );
    v_count := v_count + 1;
    v_partner := null;
  end loop;
  return v_count;
end;
$$;

create or replace function public.admin_release_settlements(
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
  -- ?? ??? ??? ??? ?? ?, ?? ???? ?? ?? ??? ????.
  perform st.id from public.settlements st
   where st.id = any(p_ids) order by st.id for update;
  foreach v_id in array p_ids loop
    update public.settlements st
       set status = 'PENDING'::public.settlement_status
     where st.id = v_id and st.status = 'HOLD'::public.settlement_status
       and not exists (
         select 1 from public.transfer_batch_settlements bs
         join public.transfer_batches b on b.id = bs.batch_id
         where bs.settlement_id = st.id
           and b.status <> 'CANCELLED'::public.transfer_batch_status
       )
     returning st.partner_id into v_partner;
    if v_partner is null then
      raise exception 'settlement_not_releasable' using errcode = '23514';
    end if;
    perform public.log_access(
      'SETTLEMENT_RELEASE', 'settlements', v_id, v_partner, btrim(p_reason)
    );
    v_count := v_count + 1;
    v_partner := null;
  end loop;
  return v_count;
end;
$$;

create or replace function public.admin_issue_transfer_file(
  p_batch_id uuid, p_reason text
)
returns table (
  batch_code text,
  item_id uuid,
  bank_code text,
  bank_name text,
  account_number text,
  holder_name text,
  amount integer,
  memo text
)
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.transfer_batch_status;
  v_creator uuid;
  v_issuer uuid;
begin
  if not public.can_manage_settlements() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 5 and 500 then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;

  select b.status, b.created_by, b.issued_by
    into v_status, v_creator, v_issuer
    from public.transfer_batches b
   where b.id = p_batch_id
   for update;
  if not found then
    raise exception 'batch_not_found' using errcode = 'P0002';
  end if;
  if v_status not in (
       'DRAFT'::public.transfer_batch_status,
       'FILE_ISSUED'::public.transfer_batch_status
     ) then
    raise exception 'batch_not_issuable' using errcode = '23514';
  end if;
  -- 배치 생성과 계좌 원문 반출을 한 사람이 모두 수행하지 못하게 한다.
  if v_creator = auth.uid() then
    raise exception 'second_admin_required' using errcode = '42501';
  end if;
  -- 재다운로드도 최초 발급자에게만 허용해 계좌번호 접근자를 늘리지 않는다.
  if v_issuer is not null and v_issuer <> auth.uid() then
    raise exception 'issuer_mismatch' using errcode = '42501';
  end if;
  -- ?? ?? RPC? ???? ?? ? ?? UUID ??? ???.
  -- ??/?? ? ?? ??? ????? ??????? ?? ??? ????.
  perform st.id from public.settlements st
    join public.transfer_batch_settlements bs on bs.settlement_id = st.id
   where bs.batch_id = p_batch_id order by st.id for update of st;
  if not exists (
    select 1 from public.transfer_batch_settlements bs where bs.batch_id = p_batch_id
  ) or exists (
    select 1 from public.transfer_batch_settlements bs
    join public.settlements st on st.id = bs.settlement_id
    where bs.batch_id = p_batch_id
      and st.status <> 'APPROVED'::public.settlement_status
  ) then
    raise exception 'settlement_not_approved_in_batch' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.transfer_batch_items bi
     where bi.batch_id = p_batch_id
       and (
         bi.bank_name ~ '^[[:space:]]*[=+@-]'
         or bi.holder_name ~ '^[[:space:]]*[=+@-]'
       )
  ) then
    raise exception 'unsafe_csv_value' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.transfer_batch_settlements bs
    where bs.batch_id = p_batch_id
      and not public.settlement_payment_ready(bs.settlement_id)
  ) then
    raise exception 'unpaid_settlement_in_batch' using errcode = '23514';
  end if;

  update public.transfer_batches
     set status = 'FILE_ISSUED'::public.transfer_batch_status,
         issued_by = coalesce(issued_by, auth.uid()),
         issued_at = coalesce(issued_at, now()),
         last_downloaded_at = now()
   where id = p_batch_id;

  perform public.log_access(
    'TRANSFER_FILE_DOWNLOAD', 'transfer_batches', p_batch_id, null,
    btrim(p_reason)
  );

  return query
  select b.code, bi.id, bi.bank_code, bi.bank_name, bi.account_number,
         bi.holder_name, bi.amount,
         left('함께가요 ' || b.code, 20)
    from public.transfer_batches b
    join public.transfer_batch_items bi on bi.batch_id = b.id
   where b.id = p_batch_id
   order by bi.partner_id;
end;
$$;

revoke all on function public.admin_hold_settlements(uuid[], text) from public, anon;
revoke all on function public.admin_release_settlements(uuid[], text) from public, anon;
revoke all on function public.admin_issue_transfer_file(uuid, text) from public, anon;
grant execute on function public.admin_hold_settlements(uuid[], text) to authenticated;
grant execute on function public.admin_release_settlements(uuid[], text) to authenticated;
grant execute on function public.admin_issue_transfer_file(uuid, text) to authenticated;
