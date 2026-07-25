-- =============================================================
-- 이메일 인증(OTP) 저장 테이블 + profiles.email 컬럼
--  - 회원가입 인증을 휴대폰 → 이메일 OTP 로 전환
--  - 코드 생성/검증은 서버 액션에서 처리, 실제 발송은 이메일 추상화(mock/resend)로 교체
--  - 클라이언트 직접 접근 차단(RLS 정책 없음) → service_role(서버)만 접근
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

-- ---------- profiles 에 연락용 이메일 컬럼 추가 ----------
-- 사용자: auth.users.email 과 동일 값 저장
-- 파트너: 로그인은 아이디(합성 이메일)지만, 인증한 실제 이메일을 여기에 저장
alter table public.profiles
  add column if not exists email text;

comment on column public.profiles.email is '연락/알림용 이메일. 파트너는 로그인 아이디와 별개의 실제 이메일.';

-- ---------- 이메일 OTP 저장 테이블 ----------
create table if not exists public.email_verifications (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  code_hash   text not null,              -- OTP 원문이 아닌 해시 저장
  expires_at  timestamptz not null,       -- 만료 시각
  attempts    int not null default 0,     -- 검증 시도 횟수
  consumed_at timestamptz,                -- 검증 성공(소비) 시각
  created_at  timestamptz not null default now()
);

comment on table public.email_verifications is '이메일 OTP 인증 기록. 서버(service_role)만 접근.';

-- 최근 코드 조회용 인덱스
create index if not exists idx_email_verifications_email
  on public.email_verifications (email, created_at desc);

-- RLS 활성화하되 정책을 두지 않아 클라이언트(anon/authenticated) 접근을 전면 차단.
-- service_role 은 RLS 를 우회하므로 서버 액션에서만 읽고 쓸 수 있음.
alter table public.email_verifications enable row level security;
