-- =============================================================
-- 시간 연동 요금 체계 — #46
--  - 정액 요금을 시간당 체계로 전환한다.
--  - 요금 계산은 lib/pricing.ts 가 단일 소스이고, DB 는 그 **결과를 스냅샷으로 저장**만 한다.
--    (단가·할증률을 예약 시점에 박아두어 이후 요금표가 바뀌어도 과거 예약이 흔들리지 않는다.)
--  - 정산 트리거는 시간 계산을 하지 않는다. reservations.final_amount 를 그대로 읽는다.
--
--  근거 : 약관 제11조(요금·최소청구·연장) · 제13조 ①(할증) · 제16조 ①(파트너 지각분 제외)
--         · 제21조(선결제·최종정산)
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

-- ---------- 예약: 요금 스냅샷 ----------
alter table public.reservations
  add column if not exists duration_minutes integer,
  add column if not exists hourly_rate      integer,
  add column if not exists fee_rate         numeric(4,3),
  add column if not exists surcharge_rate   numeric(4,3) not null default 0,
  add column if not exists prepaid_amount   integer,
  add column if not exists billed_minutes   integer,
  add column if not exists final_amount     integer;

comment on column public.reservations.duration_minutes is
  '예상 이용시간(분). duration 문자열의 파싱 결과 스냅샷.';
comment on column public.reservations.hourly_rate is
  '예약 시점의 시간당 기본요금(원). 약관 제11조 ①.';
comment on column public.reservations.fee_rate is
  '예약 시점의 플랫폼 수수료율. 최종 결제 총액 기준, 원천징수 없음.';
comment on column public.reservations.surcharge_rate is
  '주말·공휴일 할증률(0 또는 0.300). 약관 제13조 ①. 예약 시점에 고정한다.';
comment on column public.reservations.prepaid_amount is
  '선결제액(원). max(2시간, 예상 이용시간) + 할증. 약관 제21조 ①.';
comment on column public.reservations.billed_minutes is
  '최종 청구 시간(분). 최소청구·15분 올림·연장이 반영된 값.';
comment on column public.reservations.final_amount is
  '최종 이용요금(원). 서비스 종료 시 산정. 약관 제21조 ③.';

-- ---------- 서비스: 파트너 도착 통보 시각 ----------
--  파트너 지각분은 청구하지 않으므로(제16조 ①) 과금 시작 기준시각을 알아야 한다.
--  도착 통보 시각이 없으면 시작 버튼 시각으로 갈음한다.
alter table public.services
  add column if not exists arrived_at timestamptz;

comment on column public.services.arrived_at is
  '파트너 현장 도착 통보 시각. 과금 시작 기준(제16조 ①) 및 도착 안내(제12조 ③)에 쓴다.';

-- =============================================================
-- 도착 통보 RPC (파트너 전용) — 상태 전이 없이 시각만 기록
-- =============================================================
create or replace function public.arrive_service(p_service_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner uuid;
  v_status  public.service_status;
  v_arrived timestamptz;
begin
  select partner_id, status, arrived_at
    into v_partner, v_status, v_arrived
    from public.services where id = p_service_id for update;

  if not found then raise exception 'service_not_found'; end if;
  if v_partner is distinct from auth.uid() then raise exception 'not_partner'; end if;
  if v_status <> 'SCHEDULED'::public.service_status then raise exception 'invalid_state'; end if;
  -- 최초 도착 시각만 유효하다(재클릭으로 과금 기준이 밀리면 안 된다).
  if v_arrived is not null then raise exception 'already_arrived'; end if;

  update public.services
     set arrived_at = now()
   where id = p_service_id;
end;
$$;

revoke all on function public.arrive_service(uuid) from public, anon;
grant execute on function public.arrive_service(uuid) to authenticated;

-- =============================================================
-- 정산 트리거 교체 — 정액에서 실제 이용요금 기반으로
--   #22(정액) → #14(수수료 제거) → 여기서 시간 기반 + 플랫폼 수수료 복원.
--   원천징수 3.3% 는 되살리지 않는다(파트너 프리랜서).
--   final_amount 가 비어 있으면(구 데이터·산정 실패) 선결제액, 그것도 없으면 정액으로 폴백한다.
-- =============================================================
create or replace function public.create_settlement_on_complete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
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

    insert into public.settlements (service_id, partner_id, amount, fee, net)
    values (new.id, new.partner_id, v_amount, v_fee, v_amount - v_fee)
    on conflict (service_id) do nothing;
  end if;
  return new;
end;
$$;
