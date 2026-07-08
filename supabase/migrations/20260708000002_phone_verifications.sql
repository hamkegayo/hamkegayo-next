-- =============================================================
-- 휴대폰 인증(OTP) 저장 테이블
--  - 코드 생성/검증은 서버 액션에서 처리, 실제 발송은 SMS 추상화(mock/aligo)로 교체 가능
--  - 클라이언트 직접 접근 차단(RLS 정책 없음) → service_role(서버)만 접근
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

create table if not exists public.phone_verifications (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  code_hash   text not null,              -- OTP 원문이 아닌 해시 저장
  expires_at  timestamptz not null,       -- 만료 시각
  attempts    int not null default 0,     -- 검증 시도 횟수
  consumed_at timestamptz,                -- 검증 성공(소비) 시각
  created_at  timestamptz not null default now()
);

comment on table public.phone_verifications is '휴대폰 OTP 인증 기록. 서버(service_role)만 접근.';

-- 최근 코드 조회용 인덱스
create index if not exists idx_phone_verifications_phone
  on public.phone_verifications (phone, created_at desc);

-- RLS 활성화하되 정책을 두지 않아 클라이언트(anon/authenticated) 접근을 전면 차단.
-- service_role 은 RLS 를 우회하므로 서버 액션에서만 읽고 쓸 수 있음.
alter table public.phone_verifications enable row level security;
