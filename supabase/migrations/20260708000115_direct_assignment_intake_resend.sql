-- =============================================================
-- 선결제 후 운영자 직접 배정 흐름 (#300) 4/4 — 운영자 접수 알림 수동 재발송
--
--  자동 재시도(claim_intake_notifications)는 8회에서 멈춘다. 메일 설정을 고친 뒤 운영자가 관리자 화면에서
--  다시 보내게 하는 경로다. 이미 SENT 인 건은 되돌리지 않는다(중복 발송 방지).
--  실제 발송은 서버가 한다. 이 RPC 는 권한·상태를 검증하고 큐에 다시 올리기만 한다.
-- =============================================================
-- 감사 이력 종류 추가. 기본 생성 제약을 찾아 교체한다(이미 교체했으면 건너뛴다).
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.reservation_events'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%CUSTOMER_CANCELLED%'
     and pg_get_constraintdef(oid) not like '%INTAKE_NOTIFY_REQUEUED%';
  if c is not null then
    execute format('alter table public.reservation_events drop constraint %I', c);
    alter table public.reservation_events add constraint reservation_events_event_type_chk check (event_type in (
      'PAID', 'INTAKE_ACKNOWLEDGED', 'ASSIGNED', 'REASSIGNED', 'CUSTOMER_NOTICE_DONE',
      'MATCH_FAILED', 'FAILURE_NOTICE_DONE', 'REFUND_REQUESTED', 'REFUND_PG_FAILED',
      'REFUND_COMPLETED', 'REFUND_RETRY', 'CUSTOMER_CANCELLED', 'INTAKE_NOTIFY_REQUEUED'
    ));
  end if;
end $$;

create or replace function public.admin_requeue_intake_notification(p_reservation uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare i public.reservation_intakes%rowtype;
begin
  if not public.can_manage_reservations() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into i from public.reservation_intakes where reservation_id = p_reservation for update;
  if not found then raise exception 'intake_not_found' using errcode = 'P0002'; end if;
  if i.notify_status = 'SENT' then return 'ALREADY_SENT'; end if;
  -- 다른 워커가 방금 집은 건(SENDING 임대가 살아 있음)은 건드리지 않는다
  if i.notify_status = 'SENDING' and i.next_attempt_at > now() then return 'IN_PROGRESS'; end if;
  if not exists (select 1 from public.reservations r where r.id = p_reservation
                  and r.status = 'MATCHING'::public.reservation_status) then
    return 'NOT_WAITING';
  end if;
  update public.reservation_intakes
     set notify_status = 'PENDING', attempts = 0, next_attempt_at = now(), last_error = null
   where id = i.id;
  perform public.record_reservation_event(p_reservation, 'INTAKE_NOTIFY_REQUEUED', '{}'::jsonb);
  perform public.log_access('RESERVATION_INTAKE_RESEND', 'reservations', p_reservation, null, '신규 접수 알림 수동 재발송');
  return 'REQUEUED';
end $$;
revoke all on function public.admin_requeue_intake_notification(uuid) from public, anon;
grant execute on function public.admin_requeue_intake_notification(uuid) to authenticated;
