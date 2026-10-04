-- 결제 우회와 관리자 자기 권한 변경 차단 (PR #177 리뷰).
-- 약관 제9조/제21조: 선결제 후 확정, 확인된 결제에 근거한 정산.
-- 기존 적용 마이그레이션은 수정하지 않는다.
revoke all on function public.confirm_reservation_partner(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.settlement_payment_ready(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.settlements st
    join public.services sv on sv.id = st.service_id
    join public.payments p on p.id = st.payment_id
    where st.id = p_id and p.status = 'PAID'::public.payment_status
      and p.reservation_id = sv.reservation_id and st.partner_id = sv.partner_id
      and sv.status = 'COMPLETED'::public.service_status
  );
$$;
revoke all on function public.settlement_payment_ready(uuid)
  from public, anon, authenticated;

-- 단일 PAID 선결제가 검증되는 기존 1차 정산만 연결한다.
-- 결제가 없는/복수이거나 이미 다른 정산에 연결된 행은 그대로 두고 승인에서 제외한다.
update public.settlements st set payment_id = p.id
  from public.services sv, public.payments p
 where sv.id = st.service_id and p.reservation_id = sv.reservation_id
   and st.payment_id is null and st.amount > 0 and p.type = 'BASE' and p.status = 'PAID'
   and (select count(*) from public.payments p2 where p2.reservation_id = sv.reservation_id
        and p2.type = 'BASE' and p2.status = 'PAID') = 1
   and not exists (select 1 from public.settlements x where x.payment_id = p.id);

create or replace function public.admin_grant_role(
  p_target uuid, p_duty text default null, p_reason text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role public.user_role; v_actor_duty text;
begin
  if not public.can_issue_admin_duty(p_duty) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 or length(p_reason) > 500 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  if p_target = auth.uid() then
    raise exception 'self_grant_forbidden' using errcode = '42501';
  end if;
  select duty into v_actor_duty from public.admin_accounts where profile_id = auth.uid();
  select role into v_role from public.profiles where id = p_target for update;
  if (v_role = 'ADMIN'::public.user_role
      or exists (select 1 from public.admin_accounts where profile_id = p_target))
     and v_actor_duty <> '전체' then
    raise exception 'existing_admin_requires_full_duty' using errcode = '42501';
  end if;
  if v_actor_duty = '계정' and not exists (
    select 1 from auth.users where id = p_target
      and coalesce((raw_app_meta_data ->> 'must_change_password')::boolean, false)
  ) then
    raise exception 'new_dedicated_account_required' using errcode = '42501';
  end if;
  if v_role is null then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  if v_role <> 'ADMIN'::public.user_role then
    if v_role <> 'USER'::public.user_role
       or exists (select 1 from public.reservations where customer_id = p_target)
       or exists (select 1 from public.partner_accounts where profile_id = p_target)
       or exists (select 1 from public.points where user_id = p_target) then
      raise exception 'target_not_dedicated' using errcode = '23514';
    end if;
  end if;

  update public.profiles set role = 'ADMIN'::public.user_role where id = p_target;
  insert into public.admin_accounts (profile_id, duty, granted_by)
  values (p_target, p_duty, auth.uid())
  on conflict (profile_id) do update
    set duty = excluded.duty, granted_by = excluded.granted_by, granted_at = now();
  insert into public.admin_role_grants (actor_id, target_id, action, reason)
  values (auth.uid(), p_target, 'GRANT', trim(p_reason));
  perform public.log_access('ADMIN_GRANT', 'profiles', p_target, p_target, trim(p_reason));
end;
$$;


create or replace function public.admin_list_settlements(
  p_from date default null,
  p_to date default null,
  p_partner uuid default null,
  p_status text default null,
  p_limit integer default 200
)
returns table (
  id uuid,
  reservation_code text,
  use_date date,
  partner_id uuid,
  partner_name text,
  amount integer,
  fee integer,
  net integer,
  status public.settlement_status,
  reason text,
  created_at timestamptz,
  confirmed_at timestamptz,
  paid_at timestamptz,
  has_payout_account boolean,
  payment_ready boolean
)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_settlements() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in ('PENDING', 'HOLD', 'APPROVED', 'PAID') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  perform public.log_access(
    'SETTLEMENT_LIST', 'settlements', null, p_partner,
    concat_ws(' / ', p_from::text, p_to::text, p_status)
  );

  return query
  select st.id, r.code, r.use_date, st.partner_id, pr.name,
         st.amount, st.fee, st.net, st.status, st.reason,
         st.created_at, st.confirmed_at, coalesce(st.paid_at, st.settled_at),
         (pp.partner_id is not null),
         public.settlement_payment_ready(st.id)
    from public.settlements st
    join public.services sv on sv.id = st.service_id
    join public.reservations r on r.id = sv.reservation_id
    join public.profiles pr on pr.id = st.partner_id
    left join public.partner_payouts pp on pp.partner_id = st.partner_id
    left join public.payments pay on pay.id = st.payment_id
   where (p_from is null or r.use_date >= p_from)
     and (p_to is null or r.use_date <= p_to)
     and (p_partner is null or st.partner_id = p_partner)
     and (p_status is null or st.status::text = p_status)
   order by r.use_date desc, st.created_at desc
   limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;
revoke all on function public.admin_list_settlements(date, date, uuid, text, integer)
  from public, anon;
grant execute on function public.admin_list_settlements(date, date, uuid, text, integer)
  to authenticated;

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
           confirmed_at = now()
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


create or replace function public.admin_create_transfer_batch(
  p_ids uuid[], p_reason text
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_batch_id uuid := gen_random_uuid();
  v_code text;
  v_requested integer;
  v_eligible integer;
  v_partner_count integer;
  v_total integer;
begin
  if not public.can_manage_settlements() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_requested := coalesce(array_length(p_ids, 1), 0);
  if v_requested < 1 or v_requested > 200
     or length(btrim(coalesce(p_reason, ''))) not between 5 and 500 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if v_requested <> (select count(distinct id) from unnest(p_ids) as u(id)) then
    raise exception 'duplicate_input' using errcode = '22023';
  end if;

  -- 동시 요청끼리 동일 정산을 가져가지 못하도록 먼저 잠근다.
  perform 1
    from public.settlements st
   where st.id = any(p_ids)
   order by st.id
   for update;

  select count(*) into v_eligible
    from public.settlements st
   where st.id = any(p_ids)
     and public.settlement_payment_ready(st.id)
     and st.status = 'APPROVED'::public.settlement_status
     and not exists (
       select 1 from public.transfer_batch_settlements tbs
        where tbs.settlement_id = st.id
     )
     and exists (
       select 1 from public.partner_payouts pp
        where pp.partner_id = st.partner_id
     );

  if v_eligible <> v_requested then
    raise exception 'settlement_not_batchable' using errcode = '23514';
  end if;

  select count(*), sum(partner_net)
    into v_partner_count, v_total
    from (
      select st.partner_id, sum(st.net)::integer as partner_net
        from public.settlements st
       where st.id = any(p_ids)
       group by st.partner_id
    ) grouped
   where partner_net > 0;

  if v_partner_count <> (
       select count(distinct st.partner_id)
         from public.settlements st where st.id = any(p_ids)
     ) or coalesce(v_total, 0) <= 0 then
    raise exception 'non_positive_transfer_amount' using errcode = '23514';
  end if;

  v_code := 'TB-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS-')
            || upper(substr(replace(v_batch_id::text, '-', ''), 1, 6));

  insert into public.transfer_batches (
    id, code, reason, settlement_count, partner_count, total_net, created_by
  ) values (
    v_batch_id, v_code, btrim(p_reason), v_requested, v_partner_count,
    v_total, auth.uid()
  );

  insert into public.transfer_batch_items (
    batch_id, partner_id, amount, settlement_count,
    bank_code, bank_name, account_number, account_last4, holder_name
  )
  select v_batch_id, st.partner_id, sum(st.net)::integer, count(*)::integer,
         pp.bank_code, pp.bank_name, pp.account_number, pp.account_last4,
         pp.holder_name
    from public.settlements st
    join public.partner_payouts pp on pp.partner_id = st.partner_id
   where st.id = any(p_ids)
   group by st.partner_id, pp.bank_code, pp.bank_name, pp.account_number,
            pp.account_last4, pp.holder_name;

  insert into public.transfer_batch_settlements (batch_id, item_id, settlement_id)
  select v_batch_id, bi.id, st.id
    from public.settlements st
    join public.transfer_batch_items bi
      on bi.batch_id = v_batch_id and bi.partner_id = st.partner_id
   where st.id = any(p_ids);

  perform public.log_access(
    'TRANSFER_BATCH_CREATE', 'transfer_batches', v_batch_id, null,
    btrim(p_reason) || ' / ' || v_requested || '건 / ' || v_partner_count || '명'
  );

  return jsonb_build_object(
    'id', v_batch_id,
    'code', v_code,
    'settlementCount', v_requested,
    'partnerCount', v_partner_count,
    'totalNet', v_total
  );
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

comment on function public.admin_issue_transfer_file(uuid, text) is
  'MFA 정산 담당자가 이체 CSV를 발급한다. 배치 생성자와 발급자를 분리하고 모든 다운로드를 기록한다.';

revoke all on function public.admin_issue_transfer_file(uuid, text)
  from public, anon;
grant execute on function public.admin_issue_transfer_file(uuid, text)
  to authenticated;

create or replace function public.create_settlement_on_complete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment uuid;
  v_plan     text;
  v_final    integer;
  v_prepaid  integer;
  v_fee_rate numeric;
  v_amount   integer;
  v_fee      integer;
begin
  if new.status = 'COMPLETED'::public.service_status
     and old.status is distinct from new.status then

    select plan, final_amount, prepaid_amount, fee_rate
      into v_plan, v_final, v_prepaid, v_fee_rate
      from public.reservations
     where id = new.reservation_id;

    -- 시간 계산은 TS(lib/pricing.ts)가 단일 소스다. 여기서는 확정된 값을 읽기만 한다.
    v_amount := coalesce(
      v_final,
      v_prepaid,
      case when v_plan = 'plus' then 25000 else 20000 end
    );

    v_fee_rate := coalesce(
      v_fee_rate,
      case when v_plan = 'plus' then 0.24 else 0.20 end
    );

    v_fee := round(v_amount * v_fee_rate);

    select id into v_payment from public.payments
      where reservation_id = new.reservation_id and type = 'BASE'
        and status = 'PAID' order by paid_at desc nulls last, id limit 1;
    -- 결제 없는 과거 서비스도 PENDING 기록은 남기되 승인/이체는 차단한다.
    insert into public.settlements (service_id, partner_id, amount, fee, net, payment_id, reason)
    values (new.id, new.partner_id, v_amount, v_fee, v_amount - v_fee, v_payment, 'SERVICE_COMPLETED')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

comment on function public.create_settlement_on_complete() is
  '서비스 COMPLETED 시 1차 정산 생성. 취소·환불은 차감 정산을 새로 쌓는다(#49).';
