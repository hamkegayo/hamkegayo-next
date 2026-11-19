-- =============================================================
-- 선결제 후 운영자 직접 배정 흐름 (#300) 3/4 — 관리자 목록·배정·재배정·문자 안내 완료 기록
--
--  ⚠️ 약관 대조: 운영자의 파트너 직접 배정·서비스 시작 전 재배정은 현재 공개 약관(제9조)에 근거 조항이
--     없다. 구현 우선 진행, 추후 정책 개선 예정(2026-11-19 사용자 확정). 출시 전 개정·고지 필요.
--     처리방침 제5조 ②③ · 제9조 ② ④: 새 담당자도 확정(CONFIRMED) 이후에만 단계 2 정보를 보고,
--     열람 기간은 partner_can_access 가 정한다(수행기록 제출 시까지, 최대 서비스 종료 후 24시간).
--     이전 담당자는 confirmed_partner_id·services.partner_id 가 바뀌는 즉시 RLS 에서 빠진다.
--
--  권한: can_manage_reservations() = 관리자 + MFA(aal2) + duty 전체/정산. 서버 액션과 별개로 DB 에서 검증한다.
--  모든 조회·변경은 log_access 접속기록과 reservation_events 감사 이력을 남긴다.
-- =============================================================

-- ---------- 관리자 목록 — 결제 완료 미배정(매칭 대기) ----------
--  · urgent  : 희망 시작시각까지 24시간 미만(한국 시간 기준 시각 비교). 결제는 허용하되 전화 상담을 강조한다.
--  · overdue : 결제 후 24시간 경과 미처리. 경고만 한다. 자동 실패·환불은 하지 않는다.
--  개인정보 최소화 — 목록에는 성명·연락처·상세주소를 싣지 않는다(상세 RPC 에서 접속기록과 함께 연다).
create or replace function public.admin_list_waiting_reservations()
returns table (
  id               uuid,
  code             text,
  plan             text,
  use_date         date,
  arrive_time      text,
  reserve_time     text,
  duration_minutes integer,
  hospital_name    text,
  treatment        text,
  paid_at          timestamptz,
  elapsed_minutes  integer,
  start_at         timestamptz,
  urgent           boolean,
  overdue          boolean,
  payment_status   text,
  notify_status    text,
  notify_attempts  integer,
  notify_last_error text,
  acknowledged_at  timestamptz
)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.can_manage_reservations() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform public.log_access('RESERVATION_WAITING_LIST', 'reservations', null, null, '매칭 대기 예약 목록 조회');

  return query
    select r.id, r.code, r.plan, r.use_date, r.arrive_time, r.reserve_time, r.duration_minutes,
           r.hospital_name, r.treatment, r.paid_at,
           (extract(epoch from (now() - r.paid_at)) / 60)::integer,
           public.reservation_start_at(r.use_date, r.arrive_time),
           coalesce(public.reservation_start_at(r.use_date, r.arrive_time) < now() + interval '24 hours', false),
           r.paid_at < now() - interval '24 hours',
           'PAID'::text,
           i.notify_status, i.attempts, i.last_error, i.acknowledged_at
      from public.reservations r
      left join public.reservation_intakes i on i.reservation_id = r.id
     where r.matching_mode = 'admin_direct'
       and r.status = 'MATCHING'::public.reservation_status
       and r.paid_at is not null
     order by r.paid_at;
end $$;
revoke all on function public.admin_list_waiting_reservations() from public, anon;
grant execute on function public.admin_list_waiting_reservations() to authenticated;

-- ---------- 관리자 상세 ----------
-- 배정 판단에 필요한 예약 내용과 이력·환불 상태를 한 번에 준다. 열 때마다 접속기록을 남긴다.
create or replace function public.admin_get_direct_reservation(p_reservation uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if not public.can_manage_reservations() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform 1 from public.reservations where id = p_reservation and matching_mode = 'admin_direct';
  if not found then raise exception 'reservation_not_found' using errcode = 'P0002'; end if;
  perform public.log_access('RESERVATION_DIRECT_VIEW', 'reservations', p_reservation,
    (select customer_id from public.reservations where id = p_reservation), '직접 배정 예약 상세 조회');

  select jsonb_build_object(
    'reservation', to_jsonb(r) - 'patient_birth' - 'handover_phone' - 'backup_handover_phone',
    'intake', (select to_jsonb(i) from public.reservation_intakes i where i.reservation_id = r.id),
    'refund', (select to_jsonb(f) from public.reservation_refunds f where f.reservation_id = r.id),
    'payment', (select jsonb_build_object('id', p.id, 'status', p.status, 'gross', p.gross_amount,
                  'discount', p.discount_amount, 'campaign_discount', p.campaign_discount_amount,
                  'paid_at', p.paid_at)
                from public.payments p where p.reservation_id = r.id and p.type = 'BASE'
                order by (p.status = 'PAID') desc, p.created_at desc limit 1),
    'service', (select jsonb_build_object('id', s.id, 'status', s.status, 'started_at', s.started_at, 'partner_id', s.partner_id)
                from public.services s where s.reservation_id = r.id),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at, e.id)
                from public.reservation_events e where e.reservation_id = r.id), '[]'::jsonb)
  ) into v
  from public.reservations r where r.id = p_reservation;
  return v;
end $$;
revoke all on function public.admin_get_direct_reservation(uuid) from public, anon;
grant execute on function public.admin_get_direct_reservation(uuid) to authenticated;

-- ---------- 배정 후보 — 활동 가능한 파트너 ----------
-- 이름·id 만 준다. 일정 충돌은 배정 RPC 가 마지막에 다시 검증한다.
create or replace function public.admin_list_assignable_partners(p_reservation uuid)
returns table (partner_id uuid, name text, conflict boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_start timestamptz; v_end timestamptz;
begin
  if not public.can_manage_reservations() then raise exception 'forbidden' using errcode = '42501'; end if;
  select public.reservation_start_at(use_date, arrive_time),
         public.reservation_start_at(use_date, arrive_time) + make_interval(mins => coalesce(duration_minutes, 120))
    into v_start, v_end from public.reservations where id = p_reservation and matching_mode = 'admin_direct';
  if not found then raise exception 'reservation_not_found' using errcode = 'P0002'; end if;
  perform public.log_access('RESERVATION_PARTNER_CANDIDATES', 'reservations', p_reservation, null, '배정 후보 조회');

  return query
    select p.id, p.name,
           exists (
             select 1 from public.reservations o
              where o.id <> p_reservation and o.confirmed_partner_id = p.id
                and o.status = 'CONFIRMED'::public.reservation_status
                and (public.reservation_start_at(o.use_date, o.arrive_time),
                     public.reservation_start_at(o.use_date, o.arrive_time) + make_interval(mins => coalesce(o.duration_minutes, 120)))
                    overlaps (v_start, v_end))
      from public.profiles p
     where p.role = 'PARTNER'::public.user_role and p.status = 'ACTIVE'::public.account_status
     order by p.name;
end $$;
revoke all on function public.admin_list_assignable_partners(uuid) from public, anon;
grant execute on function public.admin_list_assignable_partners(uuid) to authenticated;

-- ---------- 파트너 배정·재배정 ----------
--  한 RPC 가 두 경우를 다룬다.
--    배정   : MATCHING + paid_at + 미배정 → CONFIRMED. services 행은 기존 트리거가 만든다.
--    재배정 : CONFIRMED + 서비스 SCHEDULED(시작 전) → 담당자 교체. 시작 후에는 거절한다.
--  동시성 — 예약 행을 먼저 잠그고(FOR UPDATE), 결제 행·파트너 단위 advisory 잠금을 순서대로 잡는다.
--          취소·환불 RPC 도 같은 예약 행 잠금을 먼저 잡으므로 배정과 취소가 동시에 와도 한쪽만 성립한다.
-- 두 운영자가 동시에 같은 건을 열어 둔 경우를 위해 화면이 본 상태(ASSIGN/REASSIGN)를 함께 넘기면,
-- 그 사이 상태가 바뀌었을 때 조용히 재배정으로 처리하지 않고 state_changed 로 거절한다.
drop function if exists public.admin_assign_partner(uuid, uuid, text, text, timestamptz);
create or replace function public.admin_assign_partner(
  p_reservation      uuid,
  p_partner          uuid,
  p_accepted_channel text,
  p_accepted_memo    text default null,
  p_accepted_at      timestamptz default null,
  p_expected_action  text default null
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r          public.reservations%rowtype;
  s          public.services%rowtype;
  v_memo     text := nullif(btrim(coalesce(p_accepted_memo, '')), '');
  v_accepted timestamptz := coalesce(p_accepted_at, now());
  v_start    timestamptz;
  v_end      timestamptz;
  v_prev     uuid;
  v_action   text;
  v_expected text;
  v_pay_ok   boolean;
begin
  if not public.can_manage_reservations() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_accepted_channel is null or p_accepted_channel not in ('PHONE', 'SMS', 'KAKAO', 'OTHER') then
    raise exception 'invalid_accept_channel' using errcode = '22023';
  end if;
  if v_memo is not null and char_length(v_memo) > 500 then raise exception 'memo_too_long' using errcode = '22023'; end if;
  if v_accepted > now() + interval '5 minutes' then raise exception 'invalid_accepted_at' using errcode = '22023'; end if;

  select * into r from public.reservations where id = p_reservation for update;
  if not found or r.matching_mode <> 'admin_direct' then raise exception 'reservation_not_found' using errcode = 'P0002'; end if;

  if r.status = 'MATCHING'::public.reservation_status and r.paid_at is not null and r.confirmed_partner_id is null then
    v_action := 'ASSIGNED';
  elsif r.status = 'CONFIRMED'::public.reservation_status and r.confirmed_partner_id is not null then
    v_action := 'REASSIGNED';
    v_prev := r.confirmed_partner_id;
  else
    raise exception 'not_assignable' using errcode = '23514';
  end if;
  v_expected := case v_action when 'ASSIGNED' then 'ASSIGN' else 'REASSIGN' end;
  if p_expected_action is not null and p_expected_action <> v_expected then
    raise exception 'state_changed' using errcode = '23514';
  end if;

  -- 결제 완료 건만 — BASE 결제가 PAID 이고 환불 진행·완료 기록이 없어야 한다.
  select exists (select 1 from public.payments pay where pay.reservation_id = r.id
                  and pay.type = 'BASE'::public.payment_type and pay.status = 'PAID'::public.payment_status)
         and not exists (select 1 from public.reservation_refunds f where f.reservation_id = r.id)
         and not exists (select 1 from public.payments pay where pay.reservation_id = r.id
                  and pay.type = 'REFUND'::public.payment_type)
    into v_pay_ok;
  if v_pay_ok is not true then raise exception 'payment_not_paid' using errcode = '23514'; end if;

  if v_action = 'REASSIGNED' then
    if p_partner = v_prev then raise exception 'same_partner' using errcode = '23514'; end if;
    select * into s from public.services where reservation_id = r.id for update;
    -- 서비스 시작 후에는 재배정할 수 없다. 수행기록·리포트가 이전 담당자 것이 된다.
    if not found or s.status <> 'SCHEDULED'::public.service_status or s.started_at is not null
       or exists (select 1 from public.reports rp where rp.service_id = s.id) then
      raise exception 'service_already_started' using errcode = '23514';
    end if;
  elsif public.reservation_start_at(r.use_date, r.arrive_time) < now() then
    -- 시작 예정시각이 지난 건은 배정하지 않는다. 운영자는 매칭 실패로 처리해 환불한다.
    raise exception 'start_time_passed' using errcode = '23514';
  end if;

  -- 활동 가능한 파트너인가 (파트너 계정·활성·교육 이수 — 수락 가드와 같은 기준)
  if not exists (select 1 from public.profiles p where p.id = p_partner
                  and p.role = 'PARTNER'::public.user_role and p.status = 'ACTIVE'::public.account_status) then
    raise exception 'partner_not_active' using errcode = '23514';
  end if;
  if public.partner_training_required() and not public.partner_training_complete(p_partner) then
    raise exception 'training_required' using errcode = 'P0001';
  end if;

  -- 같은 파트너에 대한 동시 배정을 직렬화한 뒤 일정 중복을 검증한다.
  perform pg_advisory_xact_lock(hashtextextended('partner-assign:' || p_partner::text, 0));
  v_start := public.reservation_start_at(r.use_date, r.arrive_time);
  v_end := v_start + make_interval(mins => coalesce(r.duration_minutes, 120));
  if exists (
    select 1 from public.reservations o
     where o.id <> r.id and o.confirmed_partner_id = p_partner
       and (o.status = 'CONFIRMED'::public.reservation_status
            or (o.status = 'MATCHING'::public.reservation_status and o.payment_deadline > now()))
       and (public.reservation_start_at(o.use_date, o.arrive_time),
            public.reservation_start_at(o.use_date, o.arrive_time) + make_interval(mins => coalesce(o.duration_minutes, 120)))
           overlaps (v_start, v_end)
  ) then
    raise exception 'partner_unavailable' using errcode = '23514';
  end if;

  update public.reservations
     set status = 'CONFIRMED'::public.reservation_status,
         confirmed_partner_id = p_partner,
         payment_deadline = null,
         assigned_at = now(),
         assigned_by = auth.uid(),
         partner_accepted_at = v_accepted,
         partner_accepted_channel = p_accepted_channel,
         partner_accepted_memo = v_memo,
         -- 새 담당자는 고객에게 확정 안내 문자를 새로 보내야 한다
         customer_notice_at = null, customer_notice_by = null, customer_notice_memo = null
   where id = r.id;

  if v_action = 'REASSIGNED' then
    -- create_service_on_confirm 은 상태 전이에만 반응하므로 서비스 담당자를 직접 바꾼다.
    -- 이전 담당자가 남긴 시작 전 메모는 새 담당자에게 넘기지 않는다.
    update public.services set partner_id = p_partner, start_memo = null where id = s.id;
  end if;

  update public.reservation_intakes
     set acknowledged_at = coalesce(acknowledged_at, now()),
         acknowledged_by = coalesce(acknowledged_by, auth.uid())
   where reservation_id = r.id;

  perform public.record_reservation_event(r.id, v_action, jsonb_build_object(
    'partner_id', p_partner, 'previous_partner_id', v_prev,
    'accepted_channel', p_accepted_channel, 'accepted_at', v_accepted, 'memo', v_memo));
  perform public.log_access(case v_action when 'ASSIGNED' then 'RESERVATION_ASSIGN' else 'RESERVATION_REASSIGN' end,
    'reservations', r.id, p_partner, '운영자 파트너 ' || case v_action when 'ASSIGNED' then '배정' else '재배정' end);

  -- 알림: 새 담당자 / 이전 담당자 / 고객
  insert into public.notifications (recipient_id, type, title, body, link, dedupe_key)
  values (p_partner, 'RESERVATION_CONFIRMED', '예약이 배정되었어요',
          '운영팀이 예약을 배정했습니다. 고객에게 확정 안내 문자를 보내 주세요.', '/partner/management',
          'direct-assigned:' || r.id::text || ':' || p_partner::text)
  on conflict (recipient_id, dedupe_key) do nothing;
  if v_prev is not null then
    insert into public.notifications (recipient_id, type, title, body, link, dedupe_key)
    values (v_prev, 'RESERVATION_CANCELLED', '배정이 변경되었어요',
            '운영팀이 담당 파트너를 변경해 이 예약은 더 이상 담당하지 않습니다.', '/partner/management',
            'direct-unassigned:' || r.id::text || ':' || v_prev::text)
    on conflict (recipient_id, dedupe_key) do nothing;
  end if;
  insert into public.notifications (recipient_id, type, title, body, link, dedupe_key)
  values (r.customer_id, 'RESERVATION_CONFIRMED',
          case v_action when 'ASSIGNED' then '예약이 확정되었어요' else '담당 파트너가 변경되었어요' end,
          '동행 파트너가 배정되어 예약이 확정되었습니다. 파트너가 확정 안내 문자를 보내드립니다.',
          '/mypage/reservations/' || r.id::text,
          'direct-confirmed:' || r.id::text || ':' || p_partner::text)
  on conflict (recipient_id, dedupe_key) do nothing;

  return jsonb_build_object('action', v_action, 'partner_id', p_partner, 'previous_partner_id', v_prev);
end $$;
revoke all on function public.admin_assign_partner(uuid, uuid, text, text, timestamptz, text) from public, anon;
grant execute on function public.admin_assign_partner(uuid, uuid, text, text, timestamptz, text) to authenticated;

-- ---------- 파트너의 고객 확정 문자 안내 완료 기록 ----------
-- 이번 범위는 자동 문자 발송이 아니다. 배정된 담당 파트너가 직접 보낸 뒤 완료만 기록한다.
-- 수행자(파트너)·시각·선택 메모를 남기고 감사 이력을 쌓는다. 이미 기록돼 있으면 덮어쓰지 않는다(멱등).
create or replace function public.partner_record_customer_notice(p_reservation uuid, p_memo text default null)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  r      public.reservations%rowtype;
  v_memo text := nullif(btrim(coalesce(p_memo, '')), '');
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'PARTNER' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_memo is not null and char_length(v_memo) > 500 then raise exception 'memo_too_long' using errcode = '22023'; end if;

  select * into r from public.reservations where id = p_reservation for update;
  if not found or r.matching_mode <> 'admin_direct' or r.confirmed_partner_id is distinct from auth.uid()
     or r.status <> 'CONFIRMED'::public.reservation_status then
    raise exception 'not_assigned_partner' using errcode = '42501';
  end if;
  -- 열람 기간이 끝난 뒤에는 기록할 수 없다(제9조 ④)
  if not public.partner_can_access(r.id) then raise exception 'access_expired' using errcode = '42501'; end if;

  if r.customer_notice_at is not null then return r.customer_notice_at; end if;

  update public.reservations
     set customer_notice_at = now(), customer_notice_by = auth.uid(), customer_notice_memo = v_memo
   where id = r.id;
  perform public.record_reservation_event(r.id, 'CUSTOMER_NOTICE_DONE', jsonb_build_object('memo', v_memo));
  perform public.log_access('RESERVATION_CUSTOMER_NOTICE', 'reservations', r.id, r.customer_id, '확정 안내 문자 완료 기록');
  return now();
end $$;
revoke all on function public.partner_record_customer_notice(uuid, text) from public, anon;
grant execute on function public.partner_record_customer_notice(uuid, text) to authenticated;
