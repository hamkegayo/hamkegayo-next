-- =============================================================
-- 회원 탈퇴와 거래기록 보존 (#72) — 개인정보처리방침 제4조 · 제11조 ②
--
--  무엇이 문제였나
--    profiles.id 는 auth.users 를 `on delete cascade` 로 참조하고, 12개
--    테이블이 다시 profiles 를 cascade 로 참조한다. 계정을 지우는 순간
--    예약·결제·정산·리포트·접속기록이 **전부 함께 사라진다.**
--    방침이 공개한 보존기간(대금결제·환불 5년, 수행기록 5년)을 지킬 수 없다.
--
--  ⚠️ 이슈 본문의 조문 번호는 낡았다(2026-09-06 확인).
--     현재 방침의 근거는 다음과 같다.
--       제4조 표 — "회원 식별 정보 (분리 보관) / 회원 탈퇴 후 3년 /
--                   분쟁 대응에 필요한 최소 정보만 분리 보관"
--       제11조 ② — "보관이 필요한 경우 다른 개인정보와 분리하거나
--                   접근을 제한하여 보관"
--       제12조 ④ — "삭제 요청이 있더라도 보존기간 동안 분리하여 보관할 수 있다"
--     방침은 **완전 익명화를 약속하지 않는다.** 최소 식별정보를 3년간
--     분리 보관한다고 공개하고 있으므로 그대로 구현한다.
--
--  선택한 방식 — 이슈의 C안(소프트 삭제)에 분리 보관을 더한 것
--    ① 아무것도 지우지 않는다. profiles 행을 남겨 12개 FK 가 전부 살아 있다.
--       cascade 를 set null 로 바꾸는 A안은 배포된 DB 에서 FK 12개를
--       재작성해야 하고, 그 사이 참조 무결성이 흔들린다.
--    ② profiles 에서 개인식별 컬럼(이름·연락처·이메일)을 지우고,
--       그 값을 접근이 차단된 withdrawn_members 로 옮긴다 = 제11조 ② 의 "분리".
--    ③ 3년이 지나면 그 분리 보관본을 파기한다.
--    ④ 예약·수행기록의 환자 정보는 **탈퇴와 무관하다.** 방침이 "서비스
--       종료 후 3년" 으로 따로 정하고 있어 자기 시계로 만료된다.
-- =============================================================

alter table public.profiles
  -- 탈퇴 시각. 분리 보관 3년의 기산점이다.
  add column if not exists withdrawn_at timestamptz;

comment on column public.profiles.withdrawn_at is
  '회원 탈퇴 시각(#72). status = WITHDRAWN 과 함께 설정된다. 분리 보관 3년의 기산점.';

-- =============================================================
-- 분리 보관 원장
--
--  ⚠️ **정책을 하나도 두지 않는다.** RLS 를 켜고 정책이 없으면 anon 과
--     authenticated 는 관리자라도 한 행도 읽지 못한다. 여기 닿는 경로는
--     security definer 함수뿐이다 — 이것이 제11조 ② 의 "접근 제한" 이다.
-- =============================================================
create table if not exists public.withdrawn_members (
  profile_id   uuid primary key references public.profiles (id) on delete cascade,
  role         public.user_role not null,
  -- 분쟁 대응에 필요한 최소 식별정보. 이 세 가지를 넘지 않는다(제4조).
  name         text,
  phone        text,
  email        text,
  withdrawn_at timestamptz not null default now(),
  -- 파기 예정일. 방침 제4조 "회원 탈퇴 후 3년".
  purge_after  timestamptz not null,
  -- 이용자가 남긴 사유. 개인정보를 적지 않는다.
  reason       text,
  created_at   timestamptz not null default now()
);

comment on table public.withdrawn_members is
  '탈퇴 회원의 분리 보관 식별정보(#72). 처리방침 제4조 "회원 탈퇴 후 3년" · 제11조 ② "분리 보관". RLS 정책을 두지 않아 클라이언트는 접근할 수 없다.';
comment on column public.withdrawn_members.purge_after is
  '파기 예정 시각(탈퇴 + 3년). run_retention_purge() 가 이 시각이 지난 행을 지운다.';

alter table public.withdrawn_members enable row level security;

create index if not exists idx_withdrawn_members_purge
  on public.withdrawn_members (purge_after);

-- =============================================================
-- ① 탈퇴 처리
--
--  한 트랜잭션에서 옮기고 지운다. 나누면 "복사는 됐는데 원본이 남은"
--  또는 그 반대의 상태가 생긴다.
--
--  거절 조건이 있다. 탈퇴는 빚과 약속에서 벗어나는 문이 아니다.
--    · 미납 추가결제 (약관 제22조 ③)
--    · 진행 예정·진행 중인 예약 — 파트너가 이미 그 시간을 비워 뒀다
--    · 파트너의 미지급 정산 — 받을 돈을 남긴 채 계정을 지울 수 없다
-- =============================================================
create or replace function public.withdraw_member(
  p_user_id uuid,
  p_reason  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_blocker text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 7));

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- 이미 탈퇴한 계정이면 조용히 성공으로 돌려준다. 두 번 눌러도 안전해야 한다.
  if v_profile.status = 'WITHDRAWN'::public.account_status then
    return jsonb_build_object('already', true, 'profile_id', p_user_id);
  end if;

  -- ---------- 거절 조건 ----------
  if public.has_unpaid_charge(p_user_id) then
    v_blocker := 'UNPAID_CHARGE';
  elsif exists (
    select 1 from public.reservations r
     where r.customer_id = p_user_id
       and r.status in ('MATCHING'::public.reservation_status,
                        'CONFIRMED'::public.reservation_status)
  ) then
    v_blocker := 'ACTIVE_RESERVATION';
  elsif exists (
    select 1 from public.services s
     where s.partner_id = p_user_id
       and s.status in ('SCHEDULED'::public.service_status,
                        'IN_PROGRESS'::public.service_status)
  ) then
    v_blocker := 'ACTIVE_SERVICE';
  elsif exists (
    select 1
      from public.settlements st
     where st.partner_id = p_user_id
       and st.status = 'PENDING'::public.settlement_status
     group by st.partner_id
    -- net 이 실수령액이다. 환불 차감 행은 음수라 합계로 봐야 한다.
    having sum(st.net) > 0
  ) then
    v_blocker := 'PENDING_SETTLEMENT';
  end if;

  if v_blocker is not null then
    raise exception '%', v_blocker using errcode = 'P0001';
  end if;

  -- ---------- 분리 보관 ----------
  insert into public.withdrawn_members (
    profile_id, role, name, phone, email, withdrawn_at, purge_after, reason
  ) values (
    v_profile.id, v_profile.role, v_profile.name, v_profile.phone,
    v_profile.email, now(), now() + interval '3 years', p_reason
  )
  on conflict (profile_id) do nothing;

  -- ---------- 원본에서 개인식별 정보 제거 ----------
  --  행 자체는 남긴다. 지우면 12개 테이블이 cascade 로 함께 사라진다.
  update public.profiles
     set name = '탈퇴회원',
         phone = null,
         phone_verified_at = null,
         email = null,
         status = 'WITHDRAWN'::public.account_status,
         withdrawn_at = now()
   where id = p_user_id;

  -- 파트너 로그인 아이디도 지운다. 남겨 두면 같은 아이디를 다시 발급할 수 없고,
  -- 아이디 자체가 실명·연락처인 경우가 있다.
  delete from public.partner_accounts where profile_id = p_user_id;

  -- 알림은 보존 대상이 아니다. 본문에 이름·병원이 그대로 들어 있다.
  delete from public.notifications where recipient_id = p_user_id;

  -- 등록해 둔 피보호자 정보도 보존 대상이 아니다 — 예약에 붙은 기록과 달리
  -- 이것은 다음 예약을 위한 편의 데이터다.
  delete from public.care_recipients where user_id = p_user_id;

  return jsonb_build_object('already', false, 'profile_id', p_user_id);
end;
$$;

comment on function public.withdraw_member(uuid, text) is
  '회원 탈퇴(#72). 개인식별 정보를 withdrawn_members 로 분리 보관하고 profiles 행은 남긴다 — 지우면 결제·정산·수행기록이 cascade 로 함께 사라진다. 미납·진행중 예약·미지급 정산이 있으면 거절한다. 서버 전용.';

revoke all on function public.withdraw_member(uuid, text)
  from public, anon, authenticated;

-- =============================================================
-- ② 보존기간 경과분 파기 — 처리방침 제11조 ①
--
--  "보유기간이 경과하거나 처리 목적이 달성된 경우 지체 없이 파기한다."
--  공개한 이상 실제로 지워야 한다. 지우는 코드가 없으면 방침이 거짓말이 된다.
-- =============================================================
create or replace function public.run_retention_purge()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_members integer;
  v_otp     integer;
begin
  -- 탈퇴 후 3년이 지난 분리 보관본 (제4조)
  with gone as (
    delete from public.withdrawn_members
     where purge_after <= now()
    returning 1
  )
  select count(*) into v_members from gone;

  -- 이메일 OTP — 인증 목적이 끝나면 남길 이유가 없다. 소비됐든 만료됐든
  -- 30일이면 재발급·중복확인 목적을 다 넘긴다.
  with gone as (
    delete from public.email_verifications
     where created_at <= now() - interval '30 days'
    returning 1
  )
  select count(*) into v_otp from gone;

  return jsonb_build_object(
    'withdrawn_purged', v_members,
    'otp_purged', v_otp,
    'at', now()
  );
end;
$$;

comment on function public.run_retention_purge() is
  '보존기간이 지난 개인정보를 파기한다(#72). 탈퇴 분리보관 3년(제4조) · 이메일 OTP 30일. 하루 1회 pg_cron 이 호출한다.';

revoke all on function public.run_retention_purge() from public, anon, authenticated;

-- =============================================================
-- ③ 관리자 조회 — 분리 보관본은 RPC 로만 열린다
--
--  분쟁 대응이 보관 목적이므로 그때는 볼 수 있어야 한다. 다만 테이블을
--  직접 열지 않고 이 함수로만 지나가게 해 조회 사실이 access_logs 에 남는다.
-- =============================================================
create or replace function public.admin_find_withdrawn_member(p_profile_id uuid)
returns table (
  profile_id   uuid,
  role         public.user_role,
  name         text,
  phone        text,
  email        text,
  withdrawn_at timestamptz,
  purge_after  timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin_live() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform public.log_access(
    'READ', 'withdrawn_members', p_profile_id, p_profile_id,
    '탈퇴 회원 분쟁 대응 조회'
  );

  return query
  select w.profile_id, w.role, w.name, w.phone, w.email,
         w.withdrawn_at, w.purge_after
    from public.withdrawn_members w
   where w.profile_id = p_profile_id;
end;
$$;

comment on function public.admin_find_withdrawn_member(uuid) is
  '탈퇴 회원의 분리 보관 식별정보를 조회한다(분쟁 대응 목적). 재인증(aal2)한 관리자만 가능하며 조회 사실이 access_logs 에 남는다.';

revoke all on function public.admin_find_withdrawn_member(uuid) from public, anon;
grant execute on function public.admin_find_withdrawn_member(uuid) to authenticated;
