-- #300 PR #302 리뷰 반영:
--  1) claim_intake_notification_for_reservation: 수동 재발송 시 클릭한 특정 예약만 대상 claim
--  2) admin_list_assignable_partners: admin_assign_partner 와 동일한 일정 충돌 기준(legacy 결제 대기 홀드 포함) 적용
--  3) admin_list_confirmed_direct_reservations: 배정 완료(CONFIRMED) 예약 목록 진입 경로 제공

-- 1. 특정 예약의 접수 알림만 임대(claim) — 수동 재발송 시 다른 대기 건이 대신 발송되지 않도록 한다.
create or replace function public.claim_intake_notification_for_reservation(p_reservation uuid)
returns table (intake_id uuid, reservation_id uuid, reservation_code text, attempts integer)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  return query
  with picked as (
    select i.id
      from public.reservation_intakes i
      join public.reservations r on r.id = i.reservation_id
     where i.reservation_id = p_reservation
       and i.notify_status in ('PENDING', 'FAILED', 'SENDING')
       and i.next_attempt_at <= now()
       and i.attempts < 8
       and r.status = 'MATCHING'::public.reservation_status
     limit 1
     for update of i skip locked
  ), claimed as (
    update public.reservation_intakes i
       set notify_status = 'SENDING',
           attempts = i.attempts + 1,
           last_attempt_at = now(),
           next_attempt_at = now() + interval '5 minutes'
      from picked
     where i.id = picked.id
    returning i.id as claimed_id, i.reservation_id as claimed_res, i.attempts as claimed_attempts
  )
  select c.claimed_id, c.claimed_res, r.code, c.claimed_attempts
    from claimed c join public.reservations r on r.id = c.claimed_res;
end $$;
revoke all on function public.claim_intake_notification_for_reservation(uuid) from public, anon, authenticated;
grant execute on function public.claim_intake_notification_for_reservation(uuid) to service_role;

-- 2. 배정 후보 조회 — admin_assign_partner 와 동일한 일정 충돌 기준(CONFIRMED + 결제 대기 홀드) 적용
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
                and (o.status = 'CONFIRMED'::public.reservation_status
                     or (o.status = 'MATCHING'::public.reservation_status and o.payment_deadline > now()))
                and (public.reservation_start_at(o.use_date, o.arrive_time),
                     public.reservation_start_at(o.use_date, o.arrive_time) + make_interval(mins => coalesce(o.duration_minutes, 120)))
                    overlaps (v_start, v_end))
      from public.profiles p
     where p.role = 'PARTNER'::public.user_role and p.status = 'ACTIVE'::public.account_status
     order by p.name;
end $$;
revoke all on function public.admin_list_assignable_partners(uuid) from public, anon;
grant execute on function public.admin_list_assignable_partners(uuid) to authenticated;

-- 3. 배정 완료(CONFIRMED) 직접 배정 예약 목록 — 서비스 시작 전 재배정 및 감사 이력 진입용
create or replace function public.admin_list_confirmed_direct_reservations()
returns table (
  id uuid,
  code text,
  plan text,
  use_date date,
  arrive_time text,
  hospital_name text,
  partner_name text,
  service_status text,
  service_started_at timestamptz,
  customer_notice_at timestamptz,
  partner_accepted_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_reservations() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform public.log_access('RESERVATION_CONFIRMED_LIST', 'reservations', null, null, '배정 완료 예약 목록 조회');

  return query
    select r.id,
           r.code,
           r.plan::text,
           r.use_date,
           r.arrive_time,
           r.hospital_name,
           p.name as partner_name,
           s.status::text as service_status,
           s.started_at as service_started_at,
           r.customer_notice_at,
           r.partner_accepted_at
      from public.reservations r
      left join public.profiles p on p.id = r.confirmed_partner_id
      left join public.services s on s.reservation_id = r.id
     where r.matching_mode = 'admin_direct'
       and r.status = 'CONFIRMED'::public.reservation_status
     order by r.use_date asc, r.arrive_time asc
     limit 50;
end $$;
revoke all on function public.admin_list_confirmed_direct_reservations() from public, anon;
grant execute on function public.admin_list_confirmed_direct_reservations() to authenticated;
