-- =============================================================
-- 파트너 최종 선택(매칭 확정) — #21
--  - 고객이 ACCEPTED 지원 파트너 중 1명을 최종 선택
--  - 예약 status = CONFIRMED + confirmed_partner_id 설정
--  - 나머지 ACCEPTED 지원건은 NOT_SELECTED 로 전이 (본인 거절 REJECTED 는 유지)
--  - CONFIRMED 전이와 NOT_SELECTED 전이는 반드시 원자적 → 단일 함수(=단일 트랜잭션)
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

-- ---------- 확정 파트너 컬럼 ----------
alter table public.reservations
  add column if not exists confirmed_partner_id uuid references public.profiles (id);

comment on column public.reservations.confirmed_partner_id is
  '최종 선택된(확정) 파트너. status=CONFIRMED 시 설정.';

-- =============================================================
-- 최종 선택 트랜잭션 RPC
--   보안: security definer 로 RLS 를 우회하되, 내부에서 auth.uid() 소유권을 직접 검증.
-- =============================================================
create or replace function public.confirm_reservation_partner(
  p_reservation_id uuid,
  p_partner_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer uuid;
  v_status   public.reservation_status;
begin
  -- 예약 소유자/상태 확인 (동시 확정 방지를 위해 행 잠금)
  select customer_id, status
    into v_customer, v_status
    from public.reservations
   where id = p_reservation_id
   for update;

  if not found then
    raise exception 'reservation_not_found';
  end if;

  if v_customer is distinct from auth.uid() then
    raise exception 'not_owner';
  end if;

  if v_status <> 'MATCHING'::public.reservation_status then
    raise exception 'not_matching';
  end if;

  -- 선택 파트너가 이 예약에 ACCEPTED 지원건을 가졌는지 확인
  if not exists (
    select 1
      from public.reservation_applications
     where reservation_id = p_reservation_id
       and partner_id = p_partner_id
       and status = 'ACCEPTED'::public.application_status
  ) then
    raise exception 'partner_not_applied';
  end if;

  -- 예약 확정
  update public.reservations
     set status = 'CONFIRMED'::public.reservation_status,
         confirmed_partner_id = p_partner_id
   where id = p_reservation_id;

  -- 나머지 ACCEPTED 지원건 → NOT_SELECTED (선택 파트너/거절건 제외)
  update public.reservation_applications
     set status = 'NOT_SELECTED'::public.application_status
   where reservation_id = p_reservation_id
     and partner_id <> p_partner_id
     and status = 'ACCEPTED'::public.application_status;
end;
$$;

revoke all on function public.confirm_reservation_partner(uuid, uuid) from public, anon;
grant execute on function public.confirm_reservation_partner(uuid, uuid) to authenticated;

-- =============================================================
-- 지원자 목록 조회 RPC (고객 최종 선택 UI)
--   profiles_select_own 정책상 고객은 파트너 이름을 직접 못 읽으므로,
--   소유권을 내부 검증하는 security definer 로 필요한 최소 필드만 노출.
-- =============================================================
create or replace function public.get_reservation_applicants(p_reservation_id uuid)
returns table (
  partner_id   uuid,
  partner_name text,
  applied_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.reservations
     where id = p_reservation_id
       and customer_id = auth.uid()
  ) then
    raise exception 'not_owner';
  end if;

  return query
    select a.partner_id, p.name, a.created_at
      from public.reservation_applications a
      join public.profiles p on p.id = a.partner_id
     where a.reservation_id = p_reservation_id
       and a.status = 'ACCEPTED'::public.application_status
     order by a.created_at asc;
end;
$$;

revoke all on function public.get_reservation_applicants(uuid) from public, anon;
grant execute on function public.get_reservation_applicants(uuid) to authenticated;
