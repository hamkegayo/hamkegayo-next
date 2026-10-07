-- =============================================================
-- 귀책 보상 크레딧(포인트) 관리자 지급 — #250
--
--  근거 (이용약관)
--   - 제16조 ⑧ : 파트너의 직전 취소, 20분 이상 지각, 노쇼 등으로 서비스 이용에 중대한 차질이
--                발생한 경우 별도의 보상정책에 따라 서비스 이용 크레딧 등을 제공할 수 있다.
--   - 제19조 ③ : 회사 또는 파트너 귀책으로 서비스가 제공되지 않은 경우 크레딧을 제공할 수 있다.
--   - 제19조 ④ : 지급기준·금액·사용방법·유효기간은 별도로 정하여 안내한다.
--
--  사용자 결정 2026-10-07
--   - 금액은 건별 입력, 1회 상한 100,000P. 유효기간 없음.
--   - 권한: 전체/정산 담당자 + MFA (can_manage_settlements).
--   - 잘못 지급하면 같은 원장에 음수 행으로 회수한다. 이미 사용된 만큼은 회수하지 않는다.
--     지급 이후 사용분은 그 보상분에서 먼저 쓴 것으로 본다 — 기존 적립·다른 보상은 줄이지 않는다.
--   - 지급·회수 시 고객 인앱 알림.
--
--  보상은 회사 부담이다. 결제·환불·파트너 정산 금액을 바꾸지 않는다.
--  예외 종료(#185/#203) 판정과 별개로 기록한다.
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

create table if not exists public.point_compensations (
  id               uuid primary key default gen_random_uuid(),
  -- 예약이 보유기간 파기로 지워져도 지급 이력은 남긴다(예약번호 사본).
  reservation_id   uuid references public.reservations (id) on delete set null,
  reservation_code text not null,
  customer_id      uuid not null references public.profiles (id) on delete cascade,
  kind             text not null check (kind in (
                     'PARTNER_LAST_MINUTE_CANCEL',  -- 파트너 직전 취소 (제16조 ⑧)
                     'PARTNER_LATE',                -- 파트너 20분 이상 지각 (제16조 ⑧)
                     'PARTNER_NO_SHOW',             -- 파트너 노쇼 (제16조 ⑧)
                     'NOT_PROVIDED'                 -- 회사·파트너 귀책 미제공 (제19조 ③)
                   )),
  amount           integer not null check (amount between 1 and 100000),
  reason           text not null check (char_length(reason) between 5 and 500),
  -- 증빙 문서명/관리번호. 원본은 별도 보관소에 두고 참조만 적는다.
  evidence_ref     text not null check (char_length(evidence_ref) between 2 and 200),
  point_id         uuid not null references public.points (id),
  granted_by       uuid not null references public.profiles (id),
  granted_at       timestamptz not null default now(),
  -- 회수 (한 번만)
  revoked_amount   integer check (revoked_amount between 0 and 100000),
  revoke_point_id  uuid references public.points (id),
  revoke_reason    text check (revoke_reason is null or char_length(revoke_reason) between 5 and 500),
  revoked_by       uuid references public.profiles (id),
  revoked_at       timestamptz,
  constraint point_compensations_revoke_consistent check (
    (revoked_at is null and revoked_amount is null and revoke_reason is null and revoked_by is null)
    or (revoked_at is not null and revoked_amount is not null and revoke_reason is not null and revoked_by is not null)
  )
);

comment on table public.point_compensations is
  '귀책 보상 포인트 지급·회수 이력 (#250, 약관 제16조 ⑧ · 제19조 ③). 원장은 points(COMPENSATION).';

create index if not exists idx_point_compensations_reservation
  on public.point_compensations (reservation_id);
create index if not exists idx_point_compensations_granted
  on public.point_compensations (granted_at desc);

alter table public.point_compensations enable row level security;
-- 정책 없음 → 관리자 RPC 로만 읽고 쓴다.
revoke all on public.point_compensations from public, anon, authenticated;

-- ---------- 대상 확인 ----------
create or replace function public.admin_compensation_target(p_code text)
returns table (
  reservation_id    uuid,
  code              text,
  status            text,
  use_date          date,
  customer_name     text,
  partner_name      text,
  termination_kind  text,
  no_show           boolean,
  granted_total     integer,
  grant_count       integer
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_res public.reservations;
begin
  if not public.can_manage_settlements() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_res from public.reservations where code = trim(p_code);
  if not found then
    raise exception 'reservation_not_found' using errcode = 'P0002';
  end if;

  perform public.log_access('COMPENSATION_TARGET', 'reservations', v_res.id, v_res.customer_id,
                            '보상 지급 대상 확인');

  return query
  select v_res.id, v_res.code, v_res.status::text, v_res.use_date,
         cp.name, pp.name, s.termination_kind, coalesce(s.no_show, false),
         coalesce((select sum(c.amount - coalesce(c.revoked_amount, 0))
                     from public.point_compensations c
                    where c.reservation_id = v_res.id), 0)::integer,
         (select count(*) from public.point_compensations c
           where c.reservation_id = v_res.id and c.revoked_at is null)::integer
    from (select 1) one
    left join public.profiles cp on cp.id = v_res.customer_id
    left join public.profiles pp on pp.id = v_res.confirmed_partner_id
    left join public.services s on s.reservation_id = v_res.id;
end;
$$;

revoke all on function public.admin_compensation_target(text) from public, anon;
grant execute on function public.admin_compensation_target(text) to authenticated;

-- ---------- 지급 ----------
create or replace function public.admin_grant_compensation(
  p_reservation_id  uuid,
  p_kind            text,
  p_amount          integer,
  p_reason          text,
  p_evidence_ref    text,
  p_allow_duplicate boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res      public.reservations;
  v_point    uuid;
  v_id       uuid;
begin
  if not public.can_manage_settlements() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('PARTNER_LAST_MINUTE_CANCEL', 'PARTNER_LATE',
                                      'PARTNER_NO_SHOW', 'NOT_PROVIDED') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 100000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if p_evidence_ref is null or char_length(trim(p_evidence_ref)) not between 2 and 200 then
    raise exception 'evidence_required' using errcode = '22023';
  end if;

  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found or v_res.customer_id is null then
    raise exception 'reservation_not_found' using errcode = 'P0002';
  end if;
  -- 매칭 중인 예약은 아직 파트너 귀책이 생길 수 없다.
  if v_res.status = 'MATCHING'::public.reservation_status then
    raise exception 'not_eligible' using errcode = 'P0001';
  end if;

  if not coalesce(p_allow_duplicate, false) and exists (
    select 1 from public.point_compensations
     where reservation_id = p_reservation_id and revoked_at is null
  ) then
    raise exception 'duplicate_compensation' using errcode = 'P0001';
  end if;

  -- spend_points 와 같은 사용자 단위 잠금 — 잔액 계산과 엇갈리지 않게 한다.
  perform pg_advisory_xact_lock(hashtextextended(v_res.customer_id::text, 0));

  insert into public.points (user_id, amount, reason, reservation_id, memo)
  values (v_res.customer_id, p_amount, 'COMPENSATION'::public.point_reason, v_res.id, '보상 지급')
  returning id into v_point;

  insert into public.point_compensations (reservation_id, reservation_code, customer_id, kind, amount,
                                          reason, evidence_ref, point_id, granted_by)
  values (v_res.id, v_res.code, v_res.customer_id, p_kind, p_amount,
          trim(p_reason), trim(p_evidence_ref), v_point, auth.uid())
  returning id into v_id;

  insert into public.notifications (recipient_id, type, title, body, link, dedupe_key)
  values (v_res.customer_id, 'POINT_COMPENSATED', '보상 포인트가 지급되었어요',
          format('예약 %s 이용에 불편을 드려 죄송합니다. %sP를 지급해 드렸어요.',
                 v_res.code, to_char(p_amount, 'FM999,999,999')),
          '/mypage/points', 'point-compensation:' || v_id::text)
  on conflict (recipient_id, dedupe_key) do nothing;

  perform public.log_access('COMPENSATION_GRANT', 'point_compensations', v_id, v_res.customer_id,
                            trim(p_reason));
  return v_id;
end;
$$;

revoke all on function public.admin_grant_compensation(uuid, text, integer, text, text, boolean)
  from public, anon;
grant execute on function public.admin_grant_compensation(uuid, text, integer, text, text, boolean)
  to authenticated;

-- ---------- 회수 ----------
-- 이미 사용된 만큼은 회수하지 않는다: min(지급액 - 지급 이후 사용액, 현재 잔액), 0 미만이면 0.
create or replace function public.admin_revoke_compensation(p_id uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c       public.point_compensations;
  v_balance integer;
  v_used    integer;
  v_amount  integer;
  v_point   uuid;
begin
  if not public.can_manage_settlements() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select * into v_c from public.point_compensations where id = p_id for update;
  if not found then
    raise exception 'compensation_not_found' using errcode = 'P0002';
  end if;
  if v_c.revoked_at is not null then
    raise exception 'already_revoked' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_c.customer_id::text, 0));
  -- 원장은 잔액 합계라 어느 지급분이 쓰였는지 기록이 없다.
  -- 지급 이후의 사용(USE)은 이 보상분에서 먼저 쓴 것으로 본다 → 기존 적립분·다른 보상분은 회수되지 않는다.
  -- 사용 취소(USE_CANCEL) 복원은 되돌려 넣지 않는다(고객 유리 쪽으로 둔다).
  select coalesce(-sum(p.amount), 0)::integer into v_used
    from public.points p
    join public.points g on g.id = v_c.point_id
   where p.user_id = v_c.customer_id
     and p.reason = 'USE'::public.point_reason
     and p.created_at > g.created_at;
  v_balance := greatest(public.point_balance(v_c.customer_id), 0);
  v_amount := least(greatest(v_c.amount - v_used, 0), v_balance);

  if v_amount > 0 then
    insert into public.points (user_id, amount, reason, reservation_id, memo)
    values (v_c.customer_id, -v_amount, 'COMPENSATION'::public.point_reason, v_c.reservation_id, '보상 회수')
    returning id into v_point;
  end if;

  update public.point_compensations
     set revoked_amount = v_amount, revoke_point_id = v_point, revoke_reason = trim(p_reason),
         revoked_by = auth.uid(), revoked_at = now()
   where id = p_id;

  if v_amount > 0 then
    insert into public.notifications (recipient_id, type, title, body, link, dedupe_key)
    values (v_c.customer_id, 'POINT_COMPENSATED', '보상 포인트 지급이 정정되었어요',
            format('예약 %s 보상 포인트 중 %sP가 정정되었어요. 문의는 고객센터로 연락해 주세요.',
                   v_c.reservation_code, to_char(v_amount, 'FM999,999,999')),
            '/mypage/points', 'point-compensation-revoke:' || p_id::text)
    on conflict (recipient_id, dedupe_key) do nothing;
  end if;

  perform public.log_access('COMPENSATION_REVOKE', 'point_compensations', p_id, v_c.customer_id,
                            trim(p_reason));
  return v_amount;
end;
$$;

revoke all on function public.admin_revoke_compensation(uuid, text) from public, anon;
grant execute on function public.admin_revoke_compensation(uuid, text) to authenticated;

-- ---------- 이력 ----------
create or replace function public.admin_list_compensations(p_limit integer default 100)
returns table (
  id               uuid,
  reservation_id   uuid,
  reservation_code text,
  customer_name    text,
  kind             text,
  amount           integer,
  reason           text,
  evidence_ref     text,
  granted_by_name  text,
  granted_at       timestamptz,
  revoked_amount   integer,
  revoke_reason    text,
  revoked_by_name  text,
  revoked_at       timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.can_manage_settlements() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.log_access('COMPENSATION_LIST', 'point_compensations', null, null, '보상 지급 이력 조회');

  return query
  select c.id, c.reservation_id, c.reservation_code, cp.name, c.kind, c.amount, c.reason, c.evidence_ref,
         gp.name, c.granted_at, c.revoked_amount, c.revoke_reason, rp.name, c.revoked_at
    from public.point_compensations c
    left join public.profiles cp on cp.id = c.customer_id
    left join public.profiles gp on gp.id = c.granted_by
    left join public.profiles rp on rp.id = c.revoked_by
   order by c.granted_at desc
   limit least(greatest(coalesce(p_limit, 100), 1), 300);
end;
$$;

revoke all on function public.admin_list_compensations(integer) from public, anon;
grant execute on function public.admin_list_compensations(integer) to authenticated;
