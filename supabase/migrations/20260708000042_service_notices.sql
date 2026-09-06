-- =============================================================
-- 현장 고지·오류 기록 (#55 잔여) — 매뉴얼 대응카드 13 · 26
--
--  두 상황을 담는다. 둘 다 "파트너가 현장에서 확정하지 않고, 사실을
--  기록해 운영센터로 넘긴다" 는 같은 모양이다.
--
--  ① 예정 종료시각 초과 (대응카드 13)
--     매뉴얼은 파트너가 추가시간을 현장에서 정하는 것을 **금지**한다.
--
--       금지 사항 — "추가시간을 현장에서 확정하지 않는다."
--       즉시 조치 — "② 이용자와 보호자에게 예상 종료시각을 알린다.
--                    ③ 운영센터에 계속 수행 가능 여부를 알린다."
--       기록 사항 — "예정·예상 종료시각 / 지연 사유와 남은 업무 /
--                    연락 대상·시각·답변"
--
--     그래서 여기 남는 것은 '동의' 가 아니라 **고지 사실**이다. 약관에도
--     연장 동의 절차는 없다 — 제11조 ⑥ 은 8분을 넘기면 실제 시간으로
--     연장요금을 산정한다고만 정한다.
--
--     왜 남겨야 하는가. 지금은 서비스가 끝난 뒤 추가결제 링크가 나가고,
--     보호자가 "연장한다는 말을 들은 적 없다" 고 하면 **반박할 자료가
--     하나도 없다.** 약관 제12조 ④ 가 분쟁 시 "함께 확인" 하라고 정한
--     자료에 이 고지 기록이 들어간다.
--
--  ② 시작·종료 버튼 오류 (대응카드 26)
--     매뉴얼은 파트너가 시각을 고치는 길을 열지 않는다.
--
--       "① 실제 시각과 장소를 기록한다 … ⑥ 운영센터에 오류 내용을
--        알린다 ⑦ 임의의 시각을 입력하지 않는다"
--       종료 기준 — "정상 입력이 저장되거나 실제 시각·오류 문구·
--                    운영센터 안내가 기록되면 완료한다."
--
--     그래서 파트너는 **신고만** 하고, 시각 정정은 관리자가 사유를 남기고
--     한다(admin_correct_service_time). #50 원칙과 같다.
--
--  ⚠️ detail·error_text 에 개인정보를 넣지 않는다. payment_incidents 와
--     같은 규칙이다. 대응카드 26 도 "아이디·비밀번호 또는 업무와 무관한
--     개인정보·진료정보가 포함된 전체 화면을 저장하거나 전송하지 않는다"
--     고 정한다.
-- =============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'service_notice_kind') then
    create type public.service_notice_kind as enum (
      'OVERRUN_NOTICE',  -- 예정 종료시각 초과 고지 (대응카드 13)
      'BUTTON_ERROR'     -- 시작·종료 버튼 오류 (대응카드 26)
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'service_notice_status') then
    create type public.service_notice_status as enum ('OPEN', 'RESOLVED');
  end if;
end $$;

create table if not exists public.service_notices (
  id           uuid primary key default gen_random_uuid(),
  service_id   uuid not null references public.services (id) on delete cascade,
  partner_id   uuid not null references public.profiles (id) on delete cascade,
  kind         public.service_notice_kind   not null,
  status       public.service_notice_status not null default 'OPEN',

  -- 파트너가 적는 "실제 시각".
  --  ⚠️ 이것은 **주장**이지 시스템 기록이 아니다. services 의 시각과 달리
  --     사람이 입력한다. 청구에 바로 쓰이지 않으며, 반영은 관리자가
  --     admin_correct_service_time 으로 사유를 남기고 한다.
  occurred_at  timestamptz not null,
  -- 서버가 찍는 접수 시각. 신고가 언제 들어왔는지는 사람이 못 고친다.
  reported_at  timestamptz not null default now(),

  -- ① 대응카드 13 전용
  --   알린 대상. 매뉴얼의 '통보대상' 개념을 따른다.
  notified_to  text,
  --   이용자·보호자에게 알린 예상 종료시각
  expected_end_at timestamptz,

  -- ② 대응카드 26 전용 — 화면에 표시된 오류 문구
  error_text   text,

  -- 지연 사유·남은 업무·통신상태 등. ⚠️ 개인정보를 넣지 않는다.
  detail       text,

  -- 운영센터 처리
  resolved_by  uuid references public.profiles (id) on delete set null,
  resolved_at  timestamptz,
  memo         text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint service_notices_notified_to_chk
    check (notified_to is null or notified_to in ('USER', 'GUARDIAN', 'BOTH'))
);

comment on table public.service_notices is
  '현장 고지·오류 기록(#55). 대응카드 13(예정 종료 초과 고지) · 26(버튼 오류). 파트너는 사실만 남기고 판단은 운영센터가 한다.';
comment on column public.service_notices.occurred_at is
  '파트너가 적는 실제 시각. **주장이지 시스템 기록이 아니다** — 청구에 직접 쓰지 않는다.';
comment on column public.service_notices.reported_at is
  '신고 접수 시각. 서버가 찍는다.';
comment on column public.service_notices.detail is
  '지연 사유·통신상태 등. ⚠️ 개인정보·진료정보를 넣지 않는다(대응카드 26 금지 사항).';

drop trigger if exists trg_service_notices_updated_at on public.service_notices;
create trigger trg_service_notices_updated_at
  before update on public.service_notices
  for each row execute function public.set_updated_at();

create index if not exists idx_service_notices_open
  on public.service_notices (created_at desc)
  where status = 'OPEN'::public.service_notice_status;
create index if not exists idx_service_notices_service
  on public.service_notices (service_id, created_at desc);

-- ---------- RLS ----------
--  파트너는 자기가 남긴 기록을 볼 수 있어야 한다. 현장 확인표가 "기록했다"
--  를 확인하라고 요구하는데 확인할 화면이 없으면 규정이 지켜지지 않는다.
--  이 테이블에는 개인정보를 넣지 않으므로 본인 조회를 열어도 새는 것이 없다.
--  관리자 조회는 정책이 아니라 RPC + access_logs 로 연다(#50).
alter table public.service_notices enable row level security;

drop policy if exists "service_notices_select_own" on public.service_notices;
create policy "service_notices_select_own"
  on public.service_notices for select
  using (auth.uid() = partner_id);

-- =============================================================
-- ① 파트너 신고
--
--  insert 정책 대신 RPC 를 쓴다. partner_id 를 클라이언트가 정하게 두면
--  남의 이름으로 기록을 남길 수 있다. 여기서는 auth.uid() 가 정한다.
-- =============================================================
create or replace function public.report_service_notice(
  p_service_id     uuid,
  p_kind           text,
  p_occurred_at    timestamptz,
  p_notified_to    text        default null,
  p_expected_end_at timestamptz default null,
  p_error_text     text        default null,
  p_detail         text        default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner uuid;
  v_id      uuid;
begin
  if p_kind not in ('OVERRUN_NOTICE', 'BUTTON_ERROR') then
    raise exception 'invalid_kind' using errcode = 'P0001';
  end if;

  select partner_id into v_partner
    from public.services where id = p_service_id;
  if not found then
    raise exception 'service_not_found' using errcode = 'P0002';
  end if;
  if v_partner is distinct from auth.uid() then
    raise exception 'not_partner' using errcode = '42501';
  end if;

  -- 미래 시각은 받지 않는다. "실제 시각" 은 이미 지난 일이다.
  -- 시계 오차 여유 1분은 record_service_time 과 맞춘다.
  if p_occurred_at > now() + interval '1 minute' then
    raise exception 'future_time' using errcode = 'P0001';
  end if;

  insert into public.service_notices (
    service_id, partner_id, kind, occurred_at,
    notified_to, expected_end_at, error_text, detail
  ) values (
    p_service_id, auth.uid(), p_kind::public.service_notice_kind, p_occurred_at,
    nullif(btrim(coalesce(p_notified_to, '')), ''),
    p_expected_end_at,
    nullif(btrim(coalesce(p_error_text, '')), ''),
    nullif(btrim(coalesce(p_detail, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.report_service_notice(uuid, text, timestamptz, text, timestamptz, text, text) is
  '파트너의 현장 고지·오류 신고(#55). 대응카드 13 · 26. partner_id 는 auth.uid() 가 정한다.';

revoke all on function public.report_service_notice(uuid, text, timestamptz, text, timestamptz, text, text) from public, anon;
grant execute on function public.report_service_notice(uuid, text, timestamptz, text, timestamptz, text, text) to authenticated;

-- =============================================================
-- ② 관리자 조회 — 처리 대기 우선
-- =============================================================
create or replace function public.admin_list_service_notices(
  p_only_open boolean default true
)
returns table (
  id            uuid,
  service_id    uuid,
  reservation_code text,
  partner_name  text,
  kind          public.service_notice_kind,
  status        public.service_notice_status,
  occurred_at   timestamptz,
  reported_at   timestamptz,
  notified_to   text,
  expected_end_at timestamptz,
  error_text    text,
  detail        text,
  memo          text,
  resolved_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin_live() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select n.id, n.service_id, r.code, p.name, n.kind, n.status,
         n.occurred_at, n.reported_at, n.notified_to, n.expected_end_at,
         n.error_text, n.detail, n.memo, n.resolved_at
    from public.service_notices n
    join public.services s on s.id = n.service_id
    join public.reservations r on r.id = s.reservation_id
    join public.profiles p on p.id = n.partner_id
   where (not p_only_open)
      or n.status = 'OPEN'::public.service_notice_status
   order by (n.status = 'OPEN'::public.service_notice_status) desc,
            n.reported_at desc;
end;
$$;

comment on function public.admin_list_service_notices(boolean) is
  '현장 고지·오류 목록(#55). 관리자 전용. 개인정보가 없는 테이블이라 별도 열람 사유를 요구하지 않는다.';

revoke all on function public.admin_list_service_notices(boolean) from public, anon;
grant execute on function public.admin_list_service_notices(boolean) to authenticated;

-- =============================================================
-- ③ 관리자 처리 완료
-- =============================================================
create or replace function public.admin_resolve_service_notice(
  p_id   uuid,
  p_memo text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin_live() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- 대응카드 26 의 종료 기준이 "운영센터 안내가 기록되면 완료" 다.
  -- 안내 없이 닫으면 기록이 반쪽이 된다.
  if length(btrim(coalesce(p_memo, ''))) < 5 then
    raise exception 'memo_required' using errcode = 'P0001';
  end if;

  update public.service_notices
     set status = 'RESOLVED'::public.service_notice_status,
         memo = btrim(p_memo),
         resolved_by = auth.uid(),
         resolved_at = now()
   where id = p_id
     and status = 'OPEN'::public.service_notice_status;

  return found;
end;
$$;

comment on function public.admin_resolve_service_notice(uuid, text) is
  '현장 고지·오류 처리 완료(#55). 운영센터 안내를 memo 로 남겨야 닫힌다 — 대응카드 26 종료 기준.';

revoke all on function public.admin_resolve_service_notice(uuid, text) from public, anon;
grant execute on function public.admin_resolve_service_notice(uuid, text) to authenticated;

-- =============================================================
-- ④ 관리자 시각 정정 — 대응카드 26 ⑧ "기록으로 대체"
--
--  파트너에게는 열지 않는다. 열면 #55 가 세운 "앱이 누른 시각만 남는다"
--  는 전제가 무너진다. 관리자가 사유를 남기고, 그 사실이 access_logs 에
--  남는다 — admin_get_reservation(id, reason) 과 같은 형태다(#50).
--
--  ⚠️ 청구를 다시 계산하지 않는다. 이미 최종 금액이 산정된 뒤라면
--     결과에 charge_finalized = true 로 알려주고, 재정산은 기존
--     환불·추가결제 경로로 처리한다. 여기서 조용히 금액을 바꾸면
--     결제 원장과 어긋난다.
-- =============================================================
create or replace function public.admin_correct_service_time(
  p_service_id uuid,
  p_field      text,
  p_at         timestamptz,
  p_reason     text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before   timestamptz;
  v_final    integer;
  v_customer uuid;
begin
  if not public.is_admin_live() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  if p_field not in (
    'arrived_at', 'started_at', 'ended_at',
    'notified_at', 'hospital_arrived_at', 'reception_at',
    'wait_started_at', 'wait_ended_at',
    'treatment_started_at', 'treatment_ended_at',
    'checkout_started_at', 'checkout_ended_at',
    'home_departed_at', 'handover_at'
  ) then
    raise exception 'invalid_field' using errcode = 'P0001';
  end if;
  if p_at > now() + interval '1 minute' then
    raise exception 'future_time' using errcode = 'P0001';
  end if;

  select r.final_amount, r.customer_id into v_final, v_customer
    from public.services s
    join public.reservations r on r.id = s.reservation_id
   where s.id = p_service_id;
  if not found then
    raise exception 'service_not_found' using errcode = 'P0002';
  end if;

  -- 고치기 전 값을 먼저 읽는다. 무엇을 무엇으로 바꿨는지가 남아야
  -- 나중에 이 정정 자체를 검증할 수 있다.
  execute format('select %I from public.services where id = $1', p_field)
     into v_before using p_service_id;

  execute format('update public.services set %I = $1 where id = $2', p_field)
    using p_at, p_service_id;

  perform public.log_access(
    'UPDATE', 'services', p_service_id, v_customer,
    format('수행 시각 정정 %s : %s → %s / 사유 : %s',
           p_field,
           coalesce(to_char(v_before at time zone 'Asia/Seoul',
                            'YYYY-MM-DD HH24:MI'), '없음'),
           to_char(p_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'),
           btrim(p_reason))
  );

  return jsonb_build_object(
    'service_id', p_service_id,
    'field', p_field,
    'at', p_at,
    -- true 면 이미 청구가 확정된 건이다. 재정산이 따로 필요하다.
    'charge_finalized', v_final is not null
  );
end;
$$;

comment on function public.admin_correct_service_time(uuid, text, timestamptz, text) is
  '수행 시각 정정(#55, 대응카드 26 ⑧). 관리자 전용 · 사유 필수 · access_logs 에 남는다. 청구는 다시 계산하지 않는다 — charge_finalized 로 알린다.';

revoke all on function public.admin_correct_service_time(uuid, text, timestamptz, text) from public, anon;
grant execute on function public.admin_correct_service_time(uuid, text, timestamptz, text) to authenticated;
