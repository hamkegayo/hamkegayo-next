-- =============================================================
-- 예약 정보 확장 2차 — 매뉴얼 업무 시작 전 확정 항목 (#77)
--
--  파트너 현장업무 매뉴얼 1장이 정한 업무 시작 조건
--    "예약 화면에 만남 장소, 이동수단, 귀가수단, 종료방식,
--     미도착·인계 실패 종료시각 또는 결과보고 경로가 없고 운영센터에서도
--     확인되지 않으면 업무를 시작하지 않는다."
--
--  ⚠️ 이 중 셋은 **예약별 입력값이 아니다** (2026-09-05 매뉴얼·약관 대조)
--    · 결과보고 경로       — 회사 고정값. 매뉴얼 3장이 "파트너 페이지 >
--                            리포트 작성" 으로 못박는다. 화면 안내로 표시한다
--    · 미도착 대기 종료시각 — 약관 제15조 ③④ 가 20분으로 정한다. 예약별로
--                            받으면 약관과 어긋난다. 예약시각 + 20분을 계산한다
--    · 인계 실패 종료시각   — 약관·매뉴얼에 기준이 없었다. 미도착과 같은
--                            20분으로 확정했다(2026-09-05 기획)
--
--  노출 단계 (처리방침 제5조 ②)
--    단계 1 (수락 검토) : 이동수단·귀가수단·종료방식·대체 인계자 유무
--                        → 제5조 ② 단계 1 표의 "이동 관련 선택사항" 에 해당한다.
--                          매뉴얼 1단계가 수락 전 확인을 요구하는 항목이기도 하다
--    단계 2 (확정 후)   : 인계자·대체 인계자의 성명·관계·연락처, 통보대상,
--                        진료정보 전달 여부
--                        → 인계자는 **이용자 본인이 아닌 제3자의 개인정보**다
-- =============================================================

alter table public.reservations
  -- 매뉴얼 2장·대응카드 11 — 파트너 개인차량 운송과 대리운전은 선택지에 없다.
  add column if not exists transport_to      text,
  add column if not exists transport_home    text,
  add column if not exists end_method        text,
  add column if not exists handover_name     text,
  add column if not exists handover_relation text,
  add column if not exists handover_phone    text,
  add column if not exists backup_handover_name     text,
  add column if not exists backup_handover_relation text,
  add column if not exists backup_handover_phone    text,
  add column if not exists notify_target     text,
  add column if not exists share_medical_info boolean not null default false;

-- 값 집합은 매뉴얼 표현을 그대로 쓴다. 화면 문구와 DB 값이 갈라지면
-- 파트너가 보는 말과 우리가 저장한 말이 달라진다.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.reservations'::regclass
       and conname = 'reservations_transport_check'
  ) then
    alter table public.reservations add constraint reservations_transport_check
      check (
        (transport_to is null or transport_to in
          ('WALK', 'PUBLIC', 'TAXI', 'FAMILY_CAR'))
        and (transport_home is null or transport_home in
          ('WALK', 'PUBLIC', 'TAXI', 'FAMILY_CAR'))
      );
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.reservations'::regclass
       and conname = 'reservations_end_method_check'
  ) then
    -- 매뉴얼 용어정의 — 성인 인계 / 독립 귀가. 긴급 인계는 예약 옵션이 아니라
    -- 정상 인계가 불가능할 때의 예외 절차다(대응카드 18).
    alter table public.reservations add constraint reservations_end_method_check
      check (end_method is null or end_method in ('ADULT_HANDOVER', 'INDEPENDENT'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.reservations'::regclass
       and conname = 'reservations_notify_target_check'
  ) then
    -- 매뉴얼 용어정의 — 통보대상은 "도착·지연·진행상황을 알릴 사람으로
    -- 지정된 이용자 또는 보호자" 다.
    alter table public.reservations add constraint reservations_notify_target_check
      check (notify_target is null or notify_target in ('USER', 'GUARDIAN', 'BOTH'));
  end if;
end;
$$;

comment on column public.reservations.transport_to is
  '병원까지의 이동수단. WALK/PUBLIC/TAXI/FAMILY_CAR. 파트너 개인차량은 허용하지 않는다(매뉴얼 2장).';
comment on column public.reservations.transport_home is
  '귀가수단. 값 집합은 transport_to 와 같다.';
comment on column public.reservations.end_method is
  '종료방식. ADULT_HANDOVER(성인 인계) / INDEPENDENT(독립 귀가). 매뉴얼 12단계.';
comment on column public.reservations.handover_name is
  '인계자 성명. ⚠️ 이용자 본인이 아닌 제3자의 개인정보 — 확정 후(단계 2)에만 제공한다.';
comment on column public.reservations.backup_handover_name is
  '대체 인계자 성명. 인계자가 오지 않을 때 순서대로 연락한다(대응카드 18).';
comment on column public.reservations.notify_target is
  '통보대상 — 도착·지연·진행상황을 알릴 대상. USER/GUARDIAN/BOTH.';
comment on column public.reservations.share_medical_info is
  '진료정보를 보호자에게 전달할지 여부. 약관 제8조 ① — 전달 여부는 이용자 의사에 따른다.';

-- =============================================================
-- 단계 1(수락 검토) 상세에 이동 조건을 더한다
--
--  매뉴얼 1단계는 수락 **전에** 이동수단·귀가수단·종료방식을 확인하라고
--  규정한다. 이 셋은 개인정보가 아니라 수행 조건이므로 처리방침 제5조 ②
--  단계 1 표의 "이동 관련 선택사항" 으로 제공한다.
--
--  인계자의 성명·연락처는 내리지 않는다. 대신 **대체 인계자가 등록돼 있는지**
--  만 boolean 으로 알려 매뉴얼 1단계의 확인 항목을 개인정보 없이 채운다.
-- =============================================================
drop function if exists public.partner_get_open_reservation(uuid);

create or replace function public.partner_get_open_reservation(p_id uuid)
returns table (
  id               uuid,
  code             text,
  plan             text,
  use_date         date,
  arrive_time      text,
  reserve_time     text,
  duration         text,
  duration_minutes integer,
  hospital_name    text,
  depart_region    text,
  hospital_region  text,
  mobility_status  text,
  cognitive_status text,
  surcharge_rate   numeric,
  transport_to     text,
  transport_home   text,
  end_method       text,
  /** 대체 인계자 등록 여부만. 성명·연락처는 확정 후에 제공한다 */
  has_backup_handover boolean,
  applied          boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'PARTNER' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not public.partner_in_review(p_id) then
    raise exception 'not_in_review' using errcode = '42501';
  end if;

  return query
    select r.id, r.code, r.plan, r.use_date, r.arrive_time, r.reserve_time,
           r.duration, r.duration_minutes,
           r.hospital_name,
           public.region_label(r.depart_address),
           public.region_label(r.hospital_address),
           r.mobility_status, r.cognitive_status, r.surcharge_rate,
           r.transport_to, r.transport_home, r.end_method,
           (r.backup_handover_name is not null and r.backup_handover_name <> ''),
           exists (
             select 1 from public.reservation_applications a
              where a.reservation_id = r.id and a.partner_id = auth.uid()
           )
      from public.reservations r
     where r.id = p_id;
end;
$$;

comment on function public.partner_get_open_reservation(uuid) is
  '매칭 전 예약 상세(수락 판단용). 단계 1 항목만 — 이동 조건 포함, 인계자 개인정보 제외. 거절·미선택 파트너는 거절된다.';

revoke all on function public.partner_get_open_reservation(uuid) from public, anon;
grant execute on function public.partner_get_open_reservation(uuid) to authenticated;
