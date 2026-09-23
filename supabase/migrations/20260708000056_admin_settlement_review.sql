-- #56 관리자 정산 목록·보류·일괄 승인.
-- 약관 제21조 ③: 실제 이용시간·연장시간·주말·공휴일 할증 및 기타 적용금액을 반영한
-- 결제 원장에서 파생된 정산만 승인한다. 미결제 시 파트너 지급 기준은 미확정이므로 제외한다.

create or replace function public.can_manage_settlements()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin_live() and exists (
    select 1 from public.admin_accounts
     where profile_id = auth.uid() and duty in ('전체', '정산')
  );
$$;
revoke all on function public.can_manage_settlements() from public, anon;
grant execute on function public.can_manage_settlements() to authenticated;

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
         (st.payment_id is null or pay.status = 'PAID'::public.payment_status)
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
       and (st.payment_id is null or pay.status = 'PAID'::public.payment_status)
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
  foreach v_id in array p_ids loop
    update public.settlements
       set status = 'HOLD'::public.settlement_status, confirmed_at = null
     where id = v_id and status in (
       'PENDING'::public.settlement_status, 'APPROVED'::public.settlement_status
     )
     returning partner_id into v_partner;
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
  foreach v_id in array p_ids loop
    update public.settlements
       set status = 'PENDING'::public.settlement_status
     where id = v_id and status = 'HOLD'::public.settlement_status
     returning partner_id into v_partner;
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

revoke all on function public.admin_approve_settlements(uuid[], text) from public, anon;
revoke all on function public.admin_hold_settlements(uuid[], text) from public, anon;
revoke all on function public.admin_release_settlements(uuid[], text) from public, anon;
grant execute on function public.admin_approve_settlements(uuid[], text) to authenticated;
grant execute on function public.admin_hold_settlements(uuid[], text) to authenticated;
grant execute on function public.admin_release_settlements(uuid[], text) to authenticated;

-- 구 단건 상태 변경 RPC로 APPROVED/PAID를 직접 만들 수 없게 막는다.
revoke execute on function public.admin_update_settlement_status(
  uuid, public.settlement_status, text
) from authenticated;
