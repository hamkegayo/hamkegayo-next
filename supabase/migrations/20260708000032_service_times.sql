-- =============================================================
-- 서비스 시각 기록 (#55) — 매뉴얼 4·7·8·9·11·12·13단계
--
--  왜 필요한가
--    약관 제12조 ④ 는 이용시간 분쟁이 생기면 "시작·종료시각 외에 도착
--    안내시각, 서비스 진행기록 등 객관적으로 확인 가능한 자료를 함께 확인"
--    한다고 정한다. 지금은 arrived_at·started_at·ended_at 셋뿐이라
--    그 "함께 확인할 자료" 가 존재하지 않는다.
--
--    매뉴얼은 각 단계에서 시각을 기록하라고 요구하고, 그 값이 그대로
--    결과보고(14단계)의 입력이 된다. 파트너가 종이에 적었다가 옮기는 대신
--    앱이 누른 시각을 그대로 남긴다 — 수기 입력은 매뉴얼이 금지한다
--    ("임의의 시각을 입력하지 않는다", 4·13단계·대응카드 26).
-- =============================================================

alter table public.services
  -- 4단계 — 도착 통보. 약관 제12조 ③ 이 통보 사실을 근거로 삼는다.
  add column if not exists notified_at          timestamptz,
  -- 7단계 — 병원 도착 · 접수 완료 · 대기
  add column if not exists hospital_arrived_at  timestamptz,
  add column if not exists reception_at         timestamptz,
  add column if not exists wait_started_at      timestamptz,
  add column if not exists wait_ended_at        timestamptz,
  -- 8단계 — 진료·검사
  add column if not exists treatment_started_at timestamptz,
  add column if not exists treatment_ended_at   timestamptz,
  -- 9단계 — 수납·서류·약국
  add column if not exists checkout_started_at  timestamptz,
  add column if not exists checkout_ended_at    timestamptz,
  -- 11단계 — 귀가 출발
  add column if not exists home_departed_at     timestamptz,
  -- 12단계 — 실제 인계 (또는 독립 귀가 확인)
  add column if not exists handover_at          timestamptz,
  -- 이용자 미도착으로 종료된 건. 약관 제15조 ③ 노쇼 판정.
  add column if not exists no_show              boolean not null default false,
  -- 파트너가 종료를 누르지 않아 시스템이 마감한 시각. 실제 종료시각과 구분한다.
  add column if not exists auto_closed_at       timestamptz;

comment on column public.services.notified_at is
  '도착 통보 시각(매뉴얼 4단계). 약관 제12조 ③ — 분쟁 시 함께 확인하는 자료.';
comment on column public.services.handover_at is
  '실제 인계 또는 독립 귀가 확인 시각(매뉴얼 12단계). 종료 버튼은 이 시각 이후에만 누른다.';
comment on column public.services.no_show is
  '이용자 미도착으로 종료된 건(약관 제15조 ③ — 예약시각부터 20분).';
comment on column public.services.auto_closed_at is
  '파트너가 종료를 누르지 않아 시스템이 마감한 시각. ended_at 은 예정 종료시각으로 적는다.';

-- =============================================================
-- ① 중간 시각 기록
--
--  필드명을 인자로 받되 **화이트리스트로 제한**한다. 임의 컬럼을 쓸 수 있게
--  두면 이 RPC 하나로 services 전체가 열린다.
--
--  시각은 클라이언트가 보내지 않고 서버가 now() 로 찍는다. 매뉴얼이
--  "임의의 시각을 입력하지 않는다" 고 규정하기 때문이다.
-- =============================================================
create or replace function public.record_service_time(
  p_service_id uuid,
  p_field      text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner uuid;
  v_status  public.service_status;
  v_at      timestamptz := now();
begin
  if p_field not in (
    'notified_at', 'hospital_arrived_at', 'reception_at',
    'wait_started_at', 'wait_ended_at',
    'treatment_started_at', 'treatment_ended_at',
    'checkout_started_at', 'checkout_ended_at',
    'home_departed_at', 'handover_at'
  ) then
    raise exception 'invalid_field' using errcode = 'P0001';
  end if;

  select partner_id, status into v_partner, v_status
    from public.services where id = p_service_id for update;

  if not found then
    raise exception 'service_not_found' using errcode = 'P0002';
  end if;
  if v_partner is distinct from auth.uid() then
    raise exception 'not_partner' using errcode = '42501';
  end if;
  -- 도착 통보는 시작 전(SCHEDULED)에 누른다. 나머지는 진행 중에만.
  if p_field = 'notified_at' then
    if v_status not in ('SCHEDULED'::public.service_status,
                        'IN_PROGRESS'::public.service_status) then
      raise exception 'invalid_state' using errcode = 'P0001';
    end if;
  elsif v_status <> 'IN_PROGRESS'::public.service_status then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  -- 이미 찍힌 시각은 덮어쓰지 않는다. 두 번 눌러도 처음 시각이 남는다.
  execute format(
    'update public.services set %I = coalesce(%I, $1) where id = $2',
    p_field, p_field
  ) using v_at, p_service_id;

  execute format('select %I from public.services where id = $1', p_field)
     into v_at using p_service_id;

  return v_at;
end;
$$;

comment on function public.record_service_time(uuid, text) is
  '서비스 중간 시각을 서버 시각으로 기록한다. 화이트리스트 필드만 허용하고, 이미 기록됐으면 덮어쓰지 않는다(매뉴얼 4·7~12단계).';

revoke all on function public.record_service_time(uuid, text) from public, anon;
grant execute on function public.record_service_time(uuid, text) to authenticated;

-- =============================================================
-- ② 이용자 미도착 종료 — 약관 제15조 ③
--
--  매뉴얼 대응카드 03 : 예약시각 정각에 시작 버튼을 누르고, 미도착 대기
--  종료시각까지 기다린 뒤 종료한다. 20분은 약관이 정한 값이라 인자로 받지
--  않는다(#77 에서 확인).
-- =============================================================
create or replace function public.end_service_no_show(p_service_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner uuid;
  v_status  public.service_status;
  v_started timestamptz;
begin
  select s.partner_id, s.status, s.started_at
    into v_partner, v_status, v_started
    from public.services s where s.id = p_service_id for update;

  if not found then
    raise exception 'service_not_found' using errcode = 'P0002';
  end if;
  if v_partner is distinct from auth.uid() then
    raise exception 'not_partner' using errcode = '42501';
  end if;
  if v_status <> 'IN_PROGRESS'::public.service_status then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  -- 20분 전에는 떠날 수 없다 — 대응카드 03 "종료시각 전에 임의로 떠나지 않는다".
  if v_started is null or now() < v_started + interval '20 minutes' then
    raise exception 'too_early' using errcode = 'P0001';
  end if;

  update public.services
     set status  = 'ENDED'::public.service_status,
         no_show = true,
         ended_at = now()
   where id = p_service_id;
end;
$$;

comment on function public.end_service_no_show(uuid) is
  '이용자 미도착으로 서비스를 종료한다. 시작 후 20분이 지나야 호출할 수 있다(약관 제15조 ③④).';

revoke all on function public.end_service_no_show(uuid) from public, anon;
grant execute on function public.end_service_no_show(uuid) to authenticated;

-- =============================================================
-- ③ 종료 버튼 누락 자동 마감
--
--  ⚠️ 이게 없으면 연장 요금이 무한히 쌓인다. 파트너가 종료를 잊은 채
--     퇴근하면 고객이 그 시간을 전부 부담하게 된다.
--
--  마감 시각은 **예정 종료시각**으로 적는다. 실제로 더 오래 걸렸다면
--  그건 기록으로 남은 진행 시각을 보고 관리자가 조정할 일이지, 시스템이
--  추정해서 청구할 일이 아니다. 고객에게 유리한 쪽으로 닫는다.
--
--  🔸 트리거 여유시간(3시간)은 기획 확인 항목이다. 약관·매뉴얼에 근거가 없다.
-- =============================================================
create or replace function public.auto_close_stale_services()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  with stale as (
    select s.id,
           s.started_at
             + make_interval(mins => coalesce(r.duration_minutes, 120)) as planned_end
      from public.services s
      join public.reservations r on r.id = s.reservation_id
     where s.status = 'IN_PROGRESS'::public.service_status
       and s.started_at is not null
  ), closing as (
    update public.services s
       set status = 'ENDED'::public.service_status,
           ended_at = stale.planned_end,
           auto_closed_at = now()
      from stale
     where s.id = stale.id
       and now() > stale.planned_end + interval '3 hours'
    returning s.id
  )
  select count(*)::integer into affected from closing;

  return affected;
end;
$$;

comment on function public.auto_close_stale_services() is
  '예정 종료시각 +3시간이 지나도 종료되지 않은 서비스를 마감한다. ended_at 은 예정 종료시각으로 적어 과청구를 막는다. 서버 전용.';

revoke all on function public.auto_close_stale_services()
  from public, anon, authenticated;

-- =============================================================
-- ④ 시작 버튼 — 예약시각 전에는 누를 수 없다
--
--  매뉴얼 4단계
--    · 예약시각보다 일찍 도착 → 예약시각 **정각**에 '시작' 을 누른다
--    · 정시 또는 늦게 도착     → 실제 도착 즉시 누른다
--    · 이용자 미도착           → 예약시각 정각에 누른다
--    · "이용자가 일찍 도착했더라도 예약시각 전에는 이동이나 동행 업무를
--       시작하지 않는다"
--
--  지금은 언제 눌러도 now() 가 그대로 들어간다. 일찍 누르면 그 시각부터
--  기록이 시작돼 매뉴얼과 어긋난다. 시각을 조용히 보정하는 대신 **거절**한다 —
--  기록을 손대면 "앱이 누른 시각 그대로" 라는 전제가 깨진다.
--
--  요금은 lib/pricing.ts 의 billingStartMs 가 이미 보정하므로(제15조 ②·
--  제16조 ①) 여기서는 기록의 정확성만 지킨다.
-- =============================================================
create or replace function public.start_service(
  p_service_id uuid,
  p_memo text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner uuid;
  v_status  public.service_status;
  v_planned timestamptz;
begin
  select s.partner_id, s.status,
         (r.use_date::date
          + make_time(
              (regexp_match(r.arrive_time, '(\d{1,2})'))[1]::int,
              coalesce((regexp_match(r.arrive_time, '\d{1,2}\D+(\d{1,2})'))[1]::int, 0),
              0
            )
         ) at time zone 'Asia/Seoul'
    into v_partner, v_status, v_planned
    from public.services s
    join public.reservations r on r.id = s.reservation_id
   where s.id = p_service_id
     for update of s;

  if not found then raise exception 'service_not_found'; end if;
  if v_partner is distinct from auth.uid() then raise exception 'not_partner'; end if;
  if v_status <> 'SCHEDULED'::public.service_status then raise exception 'invalid_state'; end if;

  -- 시계 오차를 감안해 1분 여유를 둔다. 그 이상 이르면 거절한다.
  if v_planned is not null and now() < v_planned - interval '1 minute' then
    raise exception 'too_early' using errcode = 'P0001';
  end if;

  update public.services
     set status = 'IN_PROGRESS'::public.service_status,
         started_at = now(),
         start_memo = p_memo
   where id = p_service_id;
end;
$$;

comment on function public.start_service(uuid, text) is
  '서비스를 시작한다. 예약시각 이전에는 거절한다(매뉴얼 4단계 — 일찍 도착해도 예약시각 정각에 시작).';

revoke all on function public.start_service(uuid, text) from public, anon;
grant execute on function public.start_service(uuid, text) to authenticated;
