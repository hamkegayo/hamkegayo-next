-- #285: 거동·인지 상태 매칭 전 파트너 제공 별도 동의 수집 및 미동의 노출 차단
--
-- 근거 조항 (개인정보처리방침):
--   - 제3조 ②: 민감정보는 일반 개인정보에 대한 동의와 구분하여 별도의 동의를 받음
--   - 제5조 ② [단계 1] 표 (민감정보): 매칭 전 파트너에게 거동상태·인지상태를 제공
--   - 제5조 ④: 거동상태·인지상태 등 최소한의 건강 관련 정보는 이용자의 별도 동의를 받아 예약 최종 확정 전에 제공할 수 있음
--   - 제5조 ⑥: 개인정보 및 민감정보의 제3자 제공에 관한 구체적인 사항은 예약 단계의 별도 동의 화면에서 안내하고 동의를 받음

-- =============================================================
-- 1. reservations 동의 컬럼 및 체크 제약
-- =============================================================
alter table public.reservations
  add column if not exists pre_matching_health_consented_at timestamptz,
  add column if not exists pre_matching_health_consent_version text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.reservations'::regclass
       and conname = 'reservations_pre_matching_health_consent_check'
  ) then
    alter table public.reservations
      add constraint reservations_pre_matching_health_consent_check
      check (
        (pre_matching_health_consented_at is null and pre_matching_health_consent_version is null)
        or (
          pre_matching_health_consented_at is not null
          and pre_matching_health_consent_version is not null
          and btrim(pre_matching_health_consent_version) <> ''
        )
      );
  end if;
end $$;

comment on column public.reservations.pre_matching_health_consented_at is
  '거동·인지 상태의 매칭 전(단계 1) 파트너 제공 별도 동의 시각. 처리방침 제3조 ②·제5조 ② [단계 1]·④·⑥ (#285).';
comment on column public.reservations.pre_matching_health_consent_version is
  '거동·인지 상태의 매칭 전 파트너 제공 별도 동의 시점의 개인정보처리방침 버전 (#285).';
comment on column public.reservations.mobility_status is
  '이용자 거동 상태(민감정보). 매칭 전(단계 1)에는 pre_matching_health_consented_at·version 이 모두 기록된 경우에만 파트너에게 제공한다 (#285).';
comment on column public.reservations.cognitive_status is
  '이용자 인지 상태(민감정보). 매칭 전(단계 1)에는 pre_matching_health_consented_at·version 이 모두 기록된 경우에만 파트너에게 제공한다 (#285).';

-- =============================================================
-- 2. 동의 기록 불변성 및 INSERT 서버 시각 강제 트리거
-- =============================================================
create or replace function public.guard_reservation_pre_matching_health_consent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'UPDATE' then
      if new.pre_matching_health_consented_at is distinct from old.pre_matching_health_consented_at
         or new.pre_matching_health_consent_version is distinct from old.pre_matching_health_consent_version then
        raise exception 'pre_matching_health_consent_immutable' using errcode = '42501';
      end if;
    elsif tg_op = 'INSERT' then
      if new.pre_matching_health_consented_at is not null
         or new.pre_matching_health_consent_version is not null then
        new.pre_matching_health_consented_at := now();
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_reservation_pre_matching_health_consent on public.reservations;
create trigger trg_guard_reservation_pre_matching_health_consent
  before insert or update on public.reservations
  for each row execute function public.guard_reservation_pre_matching_health_consent();

-- =============================================================
-- 3. 파트너 단계 1(매칭 전) RPC — 미동의 건은 거동·인지 상태 null 반환
-- =============================================================
create or replace function public.partner_list_open_reservations(
  p_limit  integer default 50,
  p_offset integer default 0
)
returns table (
  id               uuid,
  -- 예약번호는 개인정보가 아닌 식별자다. 파트너가 문의·정산에서 건을 지목하는 데 쓴다.
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
  -- 할증률은 개인정보가 아니라 요금 산정 파라미터다.
  -- 파트너가 자기 예상 지급액을 알아야 수락 여부를 판단할 수 있어 함께 내린다.
  -- 이용자의 결제 금액 자체는 내리지 않는다 (제5조 ⑤).
  surcharge_rate   numeric,
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

  return query
    select r.id, r.code, r.plan, r.use_date, r.arrive_time, r.reserve_time,
           r.duration, r.duration_minutes,
           r.hospital_name,
           public.region_label(r.depart_address),
           public.region_label(r.hospital_address),
           case when r.pre_matching_health_consented_at is not null
                 and r.pre_matching_health_consent_version is not null
                then r.mobility_status else null end,
           case when r.pre_matching_health_consented_at is not null
                 and r.pre_matching_health_consent_version is not null
                then r.cognitive_status else null end,
           r.surcharge_rate,
           exists (
             select 1 from public.reservation_applications a
              where a.reservation_id = r.id and a.partner_id = auth.uid()
           )
      from public.reservations r
     where r.status = 'MATCHING'::public.reservation_status
       and public.partner_in_review(r.id)
     order by r.use_date, r.reserve_time
     limit  greatest(1, least(coalesce(p_limit, 50), 200))
    offset  greatest(0, coalesce(p_offset, 0));
end;
$$;

comment on function public.partner_list_open_reservations(integer, integer) is
  '매칭 전 파트너에게 노출하는 예약 목록. 처리방침 제5조 ② 단계 1 항목만 반환하며, 거동·인지 상태는 별도 동의가 기록된 예약에서만 노출한다 (#285).';

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
           case when r.pre_matching_health_consented_at is not null
                 and r.pre_matching_health_consent_version is not null
                then r.mobility_status else null end,
           case when r.pre_matching_health_consented_at is not null
                 and r.pre_matching_health_consent_version is not null
                then r.cognitive_status else null end,
           r.surcharge_rate,
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
  '매칭 전 예약 상세(수락 판단용). 단계 1 항목만 — 이동 조건 포함, 인계자 개인정보 제외, 거동·인지 상태는 별도 동의 기록 시에만 노출 (#285). 거절·미선택 파트너는 거절된다.';

comment on function public.partner_open_reservation_matches(uuid[]) is
  '#226 수락 대기 예약별 활동 지역·이동수단 일치 여부(참·거짓만). 주소·코드 및 거동·인지 상태는 반환하지 않는다 (#285).';
