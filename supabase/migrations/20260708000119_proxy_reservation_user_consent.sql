-- #306: 보호자·가족 대리 예약 시 이용자 본인 동의 안내·확인 및 대리 동의 사유·권한 확인
--
-- 근거 조항 (개인정보처리방침 제10조):
--   - 제10조 ①: 보호자·가족이 대신 예약하더라도 민감정보(거동·인지 상태, 진료 정보)의 제공·전달은
--               원칙적으로 이용자 본인의 동의를 받아야 한다 → USER_DIRECT (본인 직접 동의)
--   - 제10조 ②: 대리 예약 시 이용자 본인에게 동의 사실을 안내하고 확인할 수 있는 수단을 제공한다
--               → 서명 토큰 링크 + 본인 확인(생년월일·연락처 끝 4자리) 후 본인이 직접 동의
--   - 제10조 ③: 이용자가 의사능력 제한 등으로 직접 동의할 수 없는 경우에 한해 보호자 대리 동의를 허용하며
--               사유와 대리 권한 확인을 기록한다 → GUARDIAN_PROXY (사유 코드·상세·권한 확인 서약)
--   - 제10조 ④: 진료·검사 내용의 보호자 전달(share_medical_info)은 실제 이용자가 동의한 범위에서만 한다
--               → 본인 동의 완료 전에는 항상 false, 대리 동의 경로에서도 false 로 고정(보수적 기본값)
--   - 제5조 ② [단계 1]·④·⑥ (#285): 본인 동의 완료 전에는 pre_matching_health_consented_at 을 기록하지 않아
--               파트너에게 거동·인지 상태가 노출되지 않고, 파트너 매칭 자체도 차단한다.
--
-- 구조
--   1. reservations 동의 모드·상태·시각·대리 사유 컬럼 + 정합성 체크
--   2. 동의 증거 불변성(authenticated/anon 위조·사후 변경 금지) 및 INSERT 서버 시각 강제 트리거
--   3. 본인 동의 대기(PENDING_USER) 중 파트너 매칭·결제·확정 차단 (partner_in_review, 알림, 지원, 확정 트리거)
--   4. 본인 동의 토큰 테이블(해시만 저장) + 발급/조회/검증/제출 RPC (검증·제출은 service_role 전용)

-- =============================================================
-- 1. reservations 컬럼
-- =============================================================
alter table public.reservations
  add column if not exists user_consent_mode text not null default 'SELF',
  add column if not exists user_consent_status text not null default 'NOT_REQUIRED',
  add column if not exists user_consent_requested_at timestamptz,
  add column if not exists user_consent_confirmed_at timestamptz,
  add column if not exists proxy_reason_code text,
  add column if not exists proxy_reason_detail text,
  add column if not exists proxy_authority_confirmed_at timestamptz,
  add column if not exists proxy_authority_version text;

alter table public.reservations
  drop constraint if exists reservations_user_consent_check;

alter table public.reservations
  add constraint reservations_user_consent_check
  check (
    (
      user_consent_mode = 'SELF'
      and user_consent_status = 'NOT_REQUIRED'
      and user_consent_requested_at is null
      and user_consent_confirmed_at is null
      and proxy_reason_code is null
      and proxy_reason_detail is null
      and proxy_authority_confirmed_at is null
      and proxy_authority_version is null
    )
    or (
      user_consent_mode = 'USER_DIRECT'
      and user_consent_status in ('PENDING_USER', 'CONFIRMED')
      and user_consent_requested_at is not null
      and ((user_consent_status = 'CONFIRMED') = (user_consent_confirmed_at is not null))
      and proxy_reason_code is null
      and proxy_reason_detail is null
      and proxy_authority_confirmed_at is null
      and proxy_authority_version is null
    )
    or (
      user_consent_mode = 'GUARDIAN_PROXY'
      and user_consent_status = 'CONFIRMED'
      and user_consent_requested_at is null
      and user_consent_confirmed_at is not null
      and proxy_reason_code in ('LACKS_CAPACITY', 'CANNOT_OPERATE', 'OTHER_LEGAL_OR_DE_FACTO')
      -- 보유기간 만료 파기(personal_data_purged_at) 후에는 자유서술 사유를 비우므로 예외로 둔다.
      and (
        personal_data_purged_at is not null
        or (proxy_reason_detail is not null
            and char_length(btrim(proxy_reason_detail)) between 10 and 500)
      )
      and proxy_authority_confirmed_at is not null
      and proxy_authority_version ~ '^\d{4}-\d{2}-\d{2}$'
    )
  );

comment on column public.reservations.user_consent_mode is
  '동의 주체. SELF 본인 예약 / USER_DIRECT 대리 예약 + 이용자 본인 직접 동의(원칙, 처리방침 제10조 ①·②) / GUARDIAN_PROXY 보호자 대리 동의(예외, 제10조 ③) (#306).';
comment on column public.reservations.user_consent_status is
  '본인 동의 상태. NOT_REQUIRED 본인 예약 / PENDING_USER 본인 동의 대기(파트너 매칭·결제 차단) / CONFIRMED 동의 완료 (#306).';
comment on column public.reservations.user_consent_requested_at is
  '본인 동의 요청(링크 발급) 시각. 서버 시각 (#306).';
comment on column public.reservations.user_consent_confirmed_at is
  '이용자 본인 동의 또는 보호자 대리 동의 확정 시각. 서버 시각 (#306).';
comment on column public.reservations.proxy_reason_code is
  '보호자 대리 동의 사유 분류. 처리방침 제10조 ③ (#306).';
comment on column public.reservations.proxy_reason_detail is
  '보호자 대리 동의 사유 상세. 처리방침 제10조 ③ (#306).';
comment on column public.reservations.proxy_authority_confirmed_at is
  '보호자의 대리 권한 확인(서약) 시각. 서버 시각. 처리방침 제10조 ③ (#306).';
comment on column public.reservations.proxy_authority_version is
  '대리 권한 확인 시점의 개인정보처리방침 버전 (#306).';

-- =============================================================
-- 2. 불변성 · INSERT 서버 시각 강제 (authenticated/anon 한정)
-- =============================================================
create or replace function public.guard_reservation_user_consent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- 동의 증거는 사후에 바꿀 수 없다. 본인 동의 확정은 service_role 전용 RPC 만 기록한다.
    if new.user_consent_mode is distinct from old.user_consent_mode
       or new.user_consent_status is distinct from old.user_consent_status
       or new.user_consent_requested_at is distinct from old.user_consent_requested_at
       or new.user_consent_confirmed_at is distinct from old.user_consent_confirmed_at
       or new.proxy_reason_code is distinct from old.proxy_reason_code
       or new.proxy_reason_detail is distinct from old.proxy_reason_detail
       or new.proxy_authority_confirmed_at is distinct from old.proxy_authority_confirmed_at
       or new.proxy_authority_version is distinct from old.proxy_authority_version then
      raise exception 'user_consent_immutable' using errcode = '42501';
    end if;
    -- 처리방침 제10조 ④ — 진료 내용 전달 동의는 실제 이용자만 정한다. 대리 예약(USER_DIRECT·GUARDIAN_PROXY)은
    -- 동의 대기·확정 여부와 무관하게 고객 권한으로 바꿀 수 없다(본인 확정은 service_role RPC 만 기록).
    -- 본인(SELF) 예약은 이용자 본인이 예약자이므로 종전처럼 변경할 수 있다.
    if old.user_consent_mode <> 'SELF'
       and new.share_medical_info is distinct from old.share_medical_info then
      raise exception 'user_consent_immutable' using errcode = '42501';
    end if;
    return new;
  end if;

  -- INSERT
  -- 처리방침 제10조 ① — 본인이 아닌 관계의 예약은 본인 예약(SELF)으로 등록할 수 없다.
  if new.user_consent_mode = 'SELF' then
    if new.relation is distinct from '본인' then
      raise exception 'proxy_consent_mode_required' using errcode = '23514';
    end if;
    if new.user_consent_status <> 'NOT_REQUIRED' then
      raise exception 'user_consent_forged' using errcode = '42501';
    end if;
    new.user_consent_requested_at := null;
    new.user_consent_confirmed_at := null;
    new.proxy_reason_code := null;
    new.proxy_reason_detail := null;
    new.proxy_authority_confirmed_at := null;
    new.proxy_authority_version := null;
    return new;
  end if;

  if new.relation is not distinct from '본인' then
    raise exception 'proxy_consent_mode_invalid' using errcode = '23514';
  end if;

  if new.user_consent_mode = 'USER_DIRECT' then
    -- 제10조 ②: 본인 동의는 대기 상태로만 시작한다. 확정·민감정보 동의 시각을 미리 채울 수 없다.
    if new.user_consent_status <> 'PENDING_USER'
       or new.pre_matching_health_consented_at is not null
       or new.pre_matching_health_consent_version is not null
       or new.share_medical_info is true then
      raise exception 'user_consent_forged' using errcode = '42501';
    end if;
    new.user_consent_requested_at := now();
    new.user_consent_confirmed_at := null;
    new.proxy_reason_code := null;
    new.proxy_reason_detail := null;
    new.proxy_authority_confirmed_at := null;
    new.proxy_authority_version := null;
    return new;
  end if;

  if new.user_consent_mode = 'GUARDIAN_PROXY' then
    -- 제10조 ③: 사유·권한 확인 서약이 있어야 하며, 시각은 서버 시각으로 기록한다.
    if new.user_consent_status <> 'CONFIRMED' then
      raise exception 'user_consent_forged' using errcode = '42501';
    end if;
    new.user_consent_requested_at := null;
    new.user_consent_confirmed_at := now();
    new.proxy_authority_confirmed_at := now();
    -- 제10조 ④: 실제 이용자가 동의하지 않은 진료 내용 전달 동의는 보호자가 대신 켤 수 없게 보수적으로 고정한다.
    new.share_medical_info := false;
    return new;
  end if;

  raise exception 'user_consent_forged' using errcode = '42501';
end;
$$;

drop trigger if exists trg_guard_reservation_user_consent on public.reservations;
create trigger trg_guard_reservation_user_consent
  before insert or update on public.reservations
  for each row execute function public.guard_reservation_user_consent();

-- 보유기간 만료 파기(run_retention_purge, 마이그레이션 59·88 과 같은 방식) — 자유서술 대리 사유는
-- 예약 개인정보와 같은 3년 기준(personal_data_purged_at 이 찍히는 순간)에 비운다. 사유 분류 코드(3종 열거)는
-- 식별성이 없어 유지한다. 새 보유기간은 만들지 않는다.
create or replace function public.clear_reservation_proxy_reason_detail()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.personal_data_purged_at is not null and old.personal_data_purged_at is null then
    new.proxy_reason_detail := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clear_reservation_proxy_reason_detail on public.reservations;
create trigger trg_clear_reservation_proxy_reason_detail
  before update of personal_data_purged_at on public.reservations
  for each row execute function public.clear_reservation_proxy_reason_detail();

-- =============================================================
-- 3. 본인 동의 대기 중 매칭·결제·확정 차단 (모든 역할)
-- =============================================================
create or replace function public.guard_pending_user_consent_matching()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- 처리방침 제10조 ①② — 본인 동의 전에는 파트너 배정·결제·확정으로 넘어갈 수 없다.
  -- (본인 동의 확정과 같은 UPDATE 에서는 old 만 PENDING 이므로 걸리지 않는다. 취소는 허용한다.)
  if old.user_consent_status = 'PENDING_USER'
     and new.user_consent_status = 'PENDING_USER'
     and (new.confirmed_partner_id is not null
          or new.paid_at is not null
          or new.status = 'CONFIRMED'::public.reservation_status) then
    raise exception 'user_consent_pending' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_pending_user_consent_matching on public.reservations;
create trigger trg_guard_pending_user_consent_matching
  before update on public.reservations
  for each row execute function public.guard_pending_user_consent_matching();

-- 파트너 지원 생성·수락 차단 (RLS 우회·직접 호출 포함)
create or replace function public.guard_pending_user_consent_applications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.reservations r
     where r.id = new.reservation_id
       and r.user_consent_status = 'PENDING_USER'
  ) then
    raise exception 'user_consent_pending' using errcode = 'P0001',
      hint = '이용자 본인 동의 대기 중인 예약은 파트너 지원을 받지 않는다 (#306, 처리방침 제10조)';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_res_apps_pending_consent_guard on public.reservation_applications;
create trigger trg_res_apps_pending_consent_guard
  before insert or update of status on public.reservation_applications
  for each row execute function public.guard_pending_user_consent_applications();

-- 파트너 목록·상세·일치 여부 RPC 가 모두 거치는 검토 단계 판정에서 본인 동의 대기 건을 뺀다.
create or replace function public.partner_in_review(res_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.reservations r
     where r.id = res_id
       and r.status = 'MATCHING'::public.reservation_status
       and r.matching_mode = 'legacy_auto'
       and r.user_consent_status <> 'PENDING_USER'
       and not exists (
         select 1
           from public.reservation_applications a
          where a.reservation_id = r.id
            and a.partner_id = auth.uid()
            and a.status in ('REJECTED'::public.application_status,
                             'NOT_SELECTED'::public.application_status)
       )
  );
$$;

-- 새 요청 알림 대상 제외 — 본문은 111 그대로이고 본인 동의 대기 조건만 더한다.
create or replace function public.notify_partners_new_request(
  p_reservation uuid,
  p_day_kind    text,
  p_title       text,
  p_body        text
)
returns table (partner_id uuid, email text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_res    public.reservations;
  v_arrive time;
begin
  if p_day_kind is null or p_day_kind not in ('WEEKDAY', 'SATURDAY', 'HOLIDAY') then
    raise exception 'invalid_day_kind' using errcode = '22023';
  end if;

  select * into v_res from public.reservations
   where id = p_reservation
     and status = 'MATCHING'::public.reservation_status
     and matching_mode = 'legacy_auto'
     and user_consent_status <> 'PENDING_USER';
  if not found then
    return;
  end if;

  v_arrive := make_time(
    least((regexp_match(v_res.arrive_time, '(\d{1,2})'))[1]::int, 23),
    least(coalesce((regexp_match(v_res.arrive_time, '\d{1,2}\D+(\d{1,2})'))[1]::int, 0), 59),
    0);

  return query
  with targets as (
    select ap.partner_id, p.email
      from public.partner_activity_profiles ap
      join public.profiles p on p.id = ap.partner_id
     where p.role = 'PARTNER' and p.status = 'ACTIVE'
       and cardinality(ap.regions) > 0
       and (
         coalesce(public.partner_activity_region_covers(ap.regions, v_res.depart_region_code), false)
         or coalesce(public.partner_activity_region_covers(ap.regions, v_res.hospital_region_code), false)
         or (v_res.depart_region_code is null
             and public.partner_activity_address_matches(ap.regions, v_res.depart_address))
         or (v_res.hospital_region_code is null
             and public.partner_activity_address_matches(ap.regions, v_res.hospital_address))
       )
       and case p_day_kind
             when 'WEEKDAY'  then v_arrive between ap.weekday_start  and ap.weekday_end
             when 'SATURDAY' then v_arrive between ap.saturday_start and ap.saturday_end
             else                 v_arrive between ap.holiday_start  and ap.holiday_end
           end
  ),
  inserted as (
    insert into public.notifications (recipient_id, type, title, body, link, dedupe_key)
    select t.partner_id, 'NEW_REQUEST', p_title, p_body,
           '/partner/requests/' || v_res.id::text,
           'new-request:' || v_res.id::text
      from targets t
    on conflict (recipient_id, dedupe_key) do nothing
    returning recipient_id
  )
  select i.recipient_id, t.email
    from inserted i
    join targets t on t.partner_id = i.recipient_id
    left join public.partner_notification_prefs np on np.partner_id = i.recipient_id
   where coalesce(np.email_new_request, true)
     and nullif(trim(t.email), '') is not null;
end;
$$;

-- =============================================================
-- 4. 본인 동의 토큰 (원문은 저장하지 않고 SHA-256 해시만 저장)
-- =============================================================
create table if not exists public.reservation_consent_tokens (
  id               uuid primary key default gen_random_uuid(),
  reservation_id   uuid not null references public.reservations (id) on delete cascade,
  token_hash       text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at       timestamptz not null,
  created_at       timestamptz not null default now(),
  -- 전달 수단 기록. 원문 링크·연락처는 남기지 않는다. MANUAL_LINK 는 보호자가 직접 전달.
  delivery_channel text not null default 'MANUAL_LINK'
                   check (delivery_channel in ('MANUAL_LINK', 'SMS', 'ALIMTALK')),
  failed_attempts  integer not null default 0 check (failed_attempts >= 0),
  locked_at        timestamptz,
  used_at          timestamptz,
  revoked_at       timestamptz
);

create index if not exists reservation_consent_tokens_reservation_idx
  on public.reservation_consent_tokens (reservation_id, created_at desc);

alter table public.reservation_consent_tokens enable row level security;
-- 정책을 두지 않는다 — 고객·파트너·익명 모두 직접 접근할 수 없고 아래 RPC 로만 다룬다.
revoke all on public.reservation_consent_tokens from public, anon, authenticated;

comment on table public.reservation_consent_tokens is
  '대리 예약 이용자 본인 동의 링크 토큰(해시만 저장). 처리방침 제10조 ② (#306).';

-- 4-1. 발급(보호자, 로그인) — 이전 미사용 토큰은 폐기하고 새로 발급한다(재발급).
create or replace function public.issue_user_consent_token(
  p_reservation_id   uuid,
  p_token_hash       text,
  p_delivery_channel text default 'MANUAL_LINK'
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res     public.reservations;
  v_start   timestamptz;
  v_expires timestamptz;
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_token_hash' using errcode = '22023';
  end if;
  if p_delivery_channel not in ('MANUAL_LINK', 'SMS', 'ALIMTALK') then
    raise exception 'invalid_delivery_channel' using errcode = '22023';
  end if;

  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found or v_res.customer_id is distinct from auth.uid() then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if v_res.user_consent_mode <> 'USER_DIRECT'
     or v_res.user_consent_status <> 'PENDING_USER'
     or v_res.status <> 'MATCHING'::public.reservation_status then
    raise exception 'consent_not_pending' using errcode = 'P0001';
  end if;

  -- 재발급 남용 방지: 시간당 5회
  if (select count(*) from public.reservation_consent_tokens
       where reservation_id = p_reservation_id
         and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'consent_token_rate_limited' using errcode = 'P0001';
  end if;

  -- 유효 시간: 24시간 또는 서비스 시작 전 중 빠른 쪽
  v_start := public.reservation_start_at(v_res.use_date, v_res.arrive_time);
  v_expires := least(now() + interval '24 hours', coalesce(v_start, now() + interval '24 hours'));
  if v_expires <= now() + interval '10 minutes' then
    raise exception 'consent_window_closed' using errcode = 'P0001';
  end if;

  update public.reservation_consent_tokens
     set revoked_at = now()
   where reservation_id = p_reservation_id
     and used_at is null
     and revoked_at is null;

  insert into public.reservation_consent_tokens (reservation_id, token_hash, expires_at, delivery_channel)
  values (p_reservation_id, p_token_hash, v_expires, p_delivery_channel);

  return v_expires;
end;
$$;

revoke all on function public.issue_user_consent_token(uuid, text, text) from public, anon;
grant execute on function public.issue_user_consent_token(uuid, text, text) to authenticated;

-- 4-2. 토큰 상태 조회(개인정보 없음) — service_role 전용
create or replace function public.get_user_consent_token_state(p_token_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tok public.reservation_consent_tokens;
  v_res public.reservations;
begin
  select * into v_tok from public.reservation_consent_tokens where token_hash = p_token_hash;
  if not found then return 'NOT_FOUND'; end if;
  select * into v_res from public.reservations where id = v_tok.reservation_id;
  if v_tok.used_at is not null or v_res.user_consent_status = 'CONFIRMED' then return 'USED'; end if;
  if v_tok.revoked_at is not null then return 'REVOKED'; end if;
  if v_tok.locked_at is not null then return 'LOCKED'; end if;
  if v_tok.expires_at <= now() then return 'EXPIRED'; end if;
  if v_res.status <> 'MATCHING'::public.reservation_status then return 'CLOSED'; end if;
  return 'VALID';
end;
$$;

-- 4-3. 본인 확인 시도(내부) — 생년월일 + 연락처 끝 4자리. 5회 실패 시 토큰 잠금.
create or replace function public.user_consent_attempt(
  p_token_hash  text,
  p_birth       date,
  p_phone_last4 text
)
returns table (result text, reservation_id uuid, attempts_left integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tok   public.reservation_consent_tokens;
  v_res   public.reservations;
  v_state text;
  v_ok    boolean;
  c_max constant integer := 5;
begin
  select * into v_tok from public.reservation_consent_tokens
   where token_hash = p_token_hash for update;
  if not found then
    return query select 'NOT_FOUND'::text, null::uuid, 0;
    return;
  end if;

  v_state := public.get_user_consent_token_state(p_token_hash);
  if v_state <> 'VALID' then
    return query select v_state, null::uuid, 0;
    return;
  end if;

  select * into v_res from public.reservations where id = v_tok.reservation_id;

  -- NULL 입력이 NULL(=통과)로 평가되지 않도록 coalesce 로 실패 처리한다.
  v_ok := coalesce(
    v_res.patient_birth is not null
    and p_birth is not null
    and v_res.patient_birth = p_birth
    and p_phone_last4 ~ '^\d{4}$'
    and right(regexp_replace(coalesce(v_res.patient_phone, ''), '\D', '', 'g'), 4) = p_phone_last4,
    false);

  if not v_ok then
    update public.reservation_consent_tokens
       set failed_attempts = failed_attempts + 1,
           locked_at = case when failed_attempts + 1 >= c_max then now() else locked_at end
     where id = v_tok.id
    returning failed_attempts into v_tok.failed_attempts;
    if v_tok.failed_attempts >= c_max then
      return query select 'LOCKED'::text, null::uuid, 0;
    else
      return query select 'MISMATCH'::text, null::uuid, c_max - v_tok.failed_attempts;
    end if;
    return;
  end if;

  update public.reservation_consent_tokens set failed_attempts = 0 where id = v_tok.id;
  return query select 'OK'::text, v_res.id, c_max;
end;
$$;

-- 4-4. 본인 확인 + 최소 예약 정보 반환 — service_role 전용
create or replace function public.verify_user_consent_identity(
  p_token_hash  text,
  p_birth       date,
  p_phone_last4 text
)
returns table (
  result          text,
  attempts_left   integer,
  plan            text,
  use_date        date,
  arrive_time     text,
  hospital_name   text,
  guardian_name   text,
  relation        text,
  expires_at      timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a record;
begin
  select * into v_a from public.user_consent_attempt(p_token_hash, p_birth, p_phone_last4);
  if v_a.result <> 'OK' then
    return query select v_a.result, v_a.attempts_left,
      null::text, null::date, null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;
  -- 본인에게 동의 판단에 필요한 최소 정보만 보여준다(예약번호·주소·거동/인지 상태는 제외).
  return query
    select 'OK'::text, v_a.attempts_left, r.plan, r.use_date, r.arrive_time,
           r.hospital_name, r.guardian_name, r.relation, t.expires_at
      from public.reservations r
      join public.reservation_consent_tokens t on t.token_hash = p_token_hash
     where r.id = v_a.reservation_id;
end;
$$;

-- 4-5. 본인 동의 제출 — 본인 확인 재검증 후 동의를 서버 시각으로 확정한다. service_role 전용
create or replace function public.submit_user_consent(
  p_token_hash     text,
  p_birth          date,
  p_phone_last4    text,
  p_agree_health   boolean,
  p_share_medical  boolean,
  p_policy_version text
)
returns table (result text, reservation_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a record;
begin
  if p_policy_version is null or p_policy_version !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'invalid_policy_version' using errcode = '22023';
  end if;

  select * into v_a from public.user_consent_attempt(p_token_hash, p_birth, p_phone_last4);
  if v_a.result <> 'OK' then
    return query select v_a.result, null::uuid;
    return;
  end if;

  -- 처리방침 제5조 ④ — 거동·인지 상태 제공 동의가 없으면 예약을 진행할 수 없다. 동의가 없으면 토큰을 소모하지 않는다.
  if p_agree_health is distinct from true then
    return query select 'HEALTH_CONSENT_REQUIRED'::text, null::uuid;
    return;
  end if;

  update public.reservations
     set user_consent_status = 'CONFIRMED',
         user_consent_confirmed_at = now(),
         pre_matching_health_consented_at = now(),
         pre_matching_health_consent_version = p_policy_version,
         -- 처리방침 제10조 ④ — 실제 이용자가 직접 선택한 값
         share_medical_info = coalesce(p_share_medical, false)
   where id = v_a.reservation_id
     and user_consent_mode = 'USER_DIRECT'
     and user_consent_status = 'PENDING_USER';
  if not found then
    return query select 'USED'::text, null::uuid;
    return;
  end if;

  update public.reservation_consent_tokens
     set used_at = now()
   where token_hash = p_token_hash;

  return query select 'OK'::text, v_a.reservation_id;
end;
$$;

revoke all on function public.get_user_consent_token_state(text) from public, anon, authenticated;
revoke all on function public.user_consent_attempt(text, date, text) from public, anon, authenticated;
revoke all on function public.verify_user_consent_identity(text, date, text) from public, anon, authenticated;
revoke all on function public.submit_user_consent(text, date, text, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.get_user_consent_token_state(text) to service_role;
grant execute on function public.user_consent_attempt(text, date, text) to service_role;
grant execute on function public.verify_user_consent_identity(text, date, text) to service_role;
grant execute on function public.submit_user_consent(text, date, text, boolean, boolean, text) to service_role;
