-- 선결제 후 운영자 직접 배정 흐름 (#300) — DB 경계 검증. 전체를 begin/rollback 으로 감싼다.
--  기존 방식 보존 · 신규 방식 차단 · 결제 완료(매칭 대기)와 확정 분리 · 접수 큐 · 배정/재배정 ·
--  문자 안내 완료 기록 · 배정 전 전액 환불 · 매칭 실패 · 만료 보호 · 권한.
-- 동시성(배정 vs 취소, 같은 파트너 중복 배정)은 scripts/test-direct-assignment-concurrency.mjs 가 본다.
begin;

create function pg_temp.assert(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'FAIL: %', p_label; end if;
  raise notice 'PASS: %', p_label;
end $$;
create function pg_temp.denied(p_sql text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'PASS: % (%)', p_label, sqlerrm;
    return;
  end;
  raise exception 'FAIL: % — expected denied', p_label;
end $$;
create function pg_temp.as_user(p_id text, p_role text default 'USER', p_aal text default 'aal2') returns void language sql as $$
  select set_config('request.jwt.claims',
    '{"sub":"'||p_id||'","role":"authenticated","aal":"'||p_aal||'","app_metadata":{"role":"'||p_role||'"}}', true);
$$;
-- 예약 한 건. 시작은 KST 기준 now() + p_hours 시간 뒤.
create function pg_temp.mk(p_n int, p_customer uuid, p_mode text, p_hours numeric default 72, p_duration int default 120)
returns uuid language plpgsql as $$
declare v_id uuid := ('00000300-0001-4000-8000-'||lpad(p_n::text,12,'0'))::uuid;
        v_kst timestamp := (now() at time zone 'Asia/Seoul') + make_interval(secs => (p_hours*3600)::int);
begin
  -- 앞선 as_user 의 JWT 가 남아 있으면 신규 예약 시간 검증(authenticated 전용)이 시드에도 걸린다
  perform set_config('request.jwt.claims', '', true);
  insert into public.reservations(id, code, customer_id, plan, patient_name, patient_birth, patient_gender, patient_phone,
    guardian_name, guardian_phone, relation, treatment, purpose, use_date, arrive_time, reserve_time, duration,
    duration_minutes, depart_address, hospital_address, matching_mode, prepaid_amount, fee_rate)
  values (v_id, 'T300-'||p_n, p_customer, 'basic', 'Test', '1960-01-01', 'female', '01000000000', 'Test', '01000000000',
    '본인', 'Test', 'Test', v_kst::date, to_char(v_kst, 'HH24:MI'), to_char(v_kst, 'HH24:MI'), '2시간',
    p_duration, 'Test', 'Test', p_mode, 40000, 0.2);
  return v_id;
end $$;
-- 결제 한 건(PENDING). 포인트 3,000원 사용분을 가정하는 금액 구성: gross 40000 − discount d − commission = payout.
create function pg_temp.pay(p_n int, p_res uuid, p_status text default 'PENDING', p_discount int default 0)
returns uuid language plpgsql as $$
declare v_id uuid := ('00000300-0002-4000-8000-'||lpad(p_n::text,12,'0'))::uuid;
begin
  insert into public.payments(id, reservation_id, type, status, order_id, gross_amount, discount_amount,
    commission_amount, payout_amount, commission_rate, transaction_id)
  values (v_id, p_res, 'BASE', p_status::public.payment_status, 'T300-ORDER-'||p_n, 40000, p_discount,
    8000 - p_discount, 32000, 0.2, 'T300-TID-'||p_n);
  return v_id;
end $$;

-- ---------- 사용자 ----------
insert into auth.users(id, email) values
  ('00000300-0000-4000-8000-000000000001', 'da-admin@example.invalid'),
  ('00000300-0000-4000-8000-000000000002', 'da-cust@example.invalid'),
  ('00000300-0000-4000-8000-000000000003', 'da-cust2@example.invalid'),
  ('00000300-0000-4000-8000-000000000011', 'da-p1@example.invalid'),
  ('00000300-0000-4000-8000-000000000012', 'da-p2@example.invalid'),
  ('00000300-0000-4000-8000-000000000013', 'da-p3-suspended@example.invalid'),
  ('00000300-0000-4000-8000-000000000009', 'da-settle-admin@example.invalid');
insert into public.profiles(id, name, role, status) values
  ('00000300-0000-4000-8000-000000000001', 'DA Admin', 'ADMIN', 'ACTIVE'),
  ('00000300-0000-4000-8000-000000000002', 'DA Cust', 'USER', 'ACTIVE'),
  ('00000300-0000-4000-8000-000000000003', 'DA Cust2', 'USER', 'ACTIVE'),
  ('00000300-0000-4000-8000-000000000011', 'DA P1', 'PARTNER', 'ACTIVE'),
  ('00000300-0000-4000-8000-000000000012', 'DA P2', 'PARTNER', 'ACTIVE'),
  ('00000300-0000-4000-8000-000000000013', 'DA P3', 'PARTNER', 'SUSPENDED'),
  ('00000300-0000-4000-8000-000000000009', 'DA Account Admin', 'ADMIN', 'ACTIVE');
insert into public.admin_accounts(profile_id, duty) values
  ('00000300-0000-4000-8000-000000000001', '정산'),
  ('00000300-0000-4000-8000-000000000009', '계정');

-- =============================================================
-- 1. 기존 방식 보존 — 기본값과 확정 경로
-- =============================================================
select pg_temp.mk(1, '00000300-0000-4000-8000-000000000002', 'legacy_auto', 300);
select pg_temp.assert((select matching_mode from public.reservations where code = 'T300-1') = 'legacy_auto', 'legacy mode stored');
select pg_temp.denied($q$update public.reservations set matching_mode = 'bogus' where code = 'T300-1'$q$, 'invalid mode rejected');
select pg_temp.denied($q$update public.reservations set matching_mode = 'legacy_auto', paid_at = now() where code = 'T300-1'$q$, 'paid_at only for admin_direct');

-- 기존 결제 확정: 파트너 선택 + PENDING 결제 → finalize_payment → CONFIRMED (회귀 없음)
update public.reservations set confirmed_partner_id = '00000300-0000-4000-8000-000000000011',
  payment_deadline = now() + interval '20 minutes' where code = 'T300-1';
select pg_temp.pay(1, '00000300-0001-4000-8000-000000000001');
select public.finalize_payment('00000300-0002-4000-8000-000000000001', 'T300-TID-1', now());
select pg_temp.assert((select status::text from public.reservations where code = 'T300-1') = 'CONFIRMED', 'legacy finalize still confirms');
select pg_temp.assert((select paid_at from public.reservations where code = 'T300-1') is null, 'legacy has no paid_at');
select pg_temp.assert(not exists (select 1 from public.reservation_intakes where reservation_id = '00000300-0001-4000-8000-000000000001'), 'legacy creates no operator intake');
select pg_temp.assert(exists (select 1 from public.services where reservation_id = '00000300-0001-4000-8000-000000000001'), 'legacy service created on confirm');

-- 기존 방식 파트너 지원은 그대로 가능 (MATCHING 예약)
select pg_temp.mk(2, '00000300-0000-4000-8000-000000000002', 'legacy_auto');
insert into public.reservation_applications(reservation_id, partner_id, status)
  values ('00000300-0001-4000-8000-000000000002', '00000300-0000-4000-8000-000000000011', 'ACCEPTED');
select pg_temp.assert((select count(*) from public.reservation_applications where reservation_id = '00000300-0001-4000-8000-000000000002') = 1, 'legacy application allowed');

-- =============================================================
-- 2. 신규 방식 차단 — 지원·선택·알림·파트너 목록·고객 직접 쓰기
-- =============================================================
select pg_temp.mk(10, '00000300-0000-4000-8000-000000000002', 'admin_direct');
select pg_temp.denied($q$insert into public.reservation_applications(reservation_id, partner_id, status)
  values ('00000300-0001-4000-8000-000000000010', '00000300-0000-4000-8000-000000000012', 'ACCEPTED')$q$, 'no partner application for admin_direct');

select pg_temp.as_user('00000300-0000-4000-8000-000000000002');
set local role authenticated;
select pg_temp.denied($q$select public.select_reservation_partner('00000300-0001-4000-8000-000000000010', '00000300-0000-4000-8000-000000000011')$q$, 'no customer selection for admin_direct');
-- 고객 권한 INSERT 는 신규 방식으로 둔갑할 수 없다
insert into public.reservations(id, code, customer_id, plan, patient_name, patient_birth, patient_gender, patient_phone,
  guardian_name, guardian_phone, relation, treatment, purpose, use_date, arrive_time, reserve_time, duration, duration_minutes, depart_address,
  hospital_address, matching_mode, paid_at)
values ('00000300-0001-4000-8000-000000000020', 'T300-20', '00000300-0000-4000-8000-000000000002', 'basic', 'T', '1960-01-01',
  'female', '01000000000', 'T', '01000000000', '본인', 'T', 'T', '2099-01-01', '09:00', '09:00', '2시간', 120, 'T', 'T', 'admin_direct', now());
select pg_temp.assert((select matching_mode from public.reservations where code = 'T300-20') = 'legacy_auto'
  and (select paid_at from public.reservations where code = 'T300-20') is null, 'customer insert cannot spoof admin_direct/paid_at');
select pg_temp.denied($q$update public.reservations set paid_at = now() where code = 'T300-10'$q$, 'customer cannot set paid_at');
select pg_temp.denied($q$update public.reservations set matching_mode = 'admin_direct' where code = 'T300-20'$q$, 'customer cannot switch mode');
select pg_temp.denied($q$update public.reservations set status = 'CONFIRMED' where code = 'T300-10'$q$, 'customer cannot confirm admin_direct row');
select pg_temp.denied($q$update public.reservations set confirmed_partner_id = '00000300-0000-4000-8000-000000000011' where code = 'T300-10'$q$, 'customer cannot pick partner on admin_direct');
reset role;

-- 파트너 매칭 전 검토 목록에서 신규 방식은 보이지 않고 기존 방식은 보인다
select pg_temp.as_user('00000300-0000-4000-8000-000000000012', 'PARTNER');
set local role authenticated;
select pg_temp.assert(public.partner_in_review('00000300-0001-4000-8000-000000000002') is true, 'legacy MATCHING visible to partners');
select pg_temp.assert(public.partner_in_review('00000300-0001-4000-8000-000000000010') is false, 'admin_direct hidden from partners');
reset role;
select pg_temp.assert((select count(*) from public.notify_partners_new_request('00000300-0001-4000-8000-000000000010', 'WEEKDAY', 't', 'b')) = 0, 'no partner alert for admin_direct');

-- =============================================================
-- 3. 결제 완료(매칭 대기) ≠ 확정 — 접수 행은 결제 승인과 한 트랜잭션
-- =============================================================
select pg_temp.pay(10, '00000300-0001-4000-8000-000000000010');
-- 결제 실패·취소 건은 접수도 알림도 없다
select pg_temp.mk(11, '00000300-0000-4000-8000-000000000002', 'admin_direct');
select pg_temp.pay(11, '00000300-0001-4000-8000-000000000011', 'FAILED');
select pg_temp.assert(not exists (select 1 from public.reservation_intakes where reservation_id = '00000300-0001-4000-8000-000000000011'), 'failed payment creates no intake');

select public.finalize_payment('00000300-0002-4000-8000-000000000010', 'T300-TID-10', now(), null, '{"x":1}');
select pg_temp.assert((select status::text from public.reservations where code = 'T300-10') = 'MATCHING', 'paid admin_direct stays MATCHING (not confirmed)');
select pg_temp.assert((select paid_at is not null and confirmed_partner_id is null from public.reservations where code = 'T300-10'), 'paid_at set, no partner');
select pg_temp.assert((select count(*) from public.services where reservation_id = '00000300-0001-4000-8000-000000000010') = 0, 'no service before assignment');
select pg_temp.assert((select count(*) from public.reservation_intakes where reservation_id = '00000300-0001-4000-8000-000000000010') = 1, 'one intake row');
select pg_temp.assert((select count(*) from public.reservation_events where reservation_id = '00000300-0001-4000-8000-000000000010' and event_type = 'PAID') = 1, 'PAID event');
select pg_temp.assert((select count(*) from public.notifications where dedupe_key = 'direct-received:00000300-0001-4000-8000-000000000010') = 1, 'one customer receipt notification');
-- 재콜백·재요청 — 중복 접수·중복 알림 없음
select public.finalize_payment('00000300-0002-4000-8000-000000000010', 'T300-TID-10', now());
select public.mark_reservation_paid('00000300-0001-4000-8000-000000000010', '00000300-0002-4000-8000-000000000010');
select pg_temp.assert((select count(*) from public.reservation_intakes where reservation_id = '00000300-0001-4000-8000-000000000010') = 1, 'no duplicate intake on re-callback');
select pg_temp.assert((select count(*) from public.reservation_events where reservation_id = '00000300-0001-4000-8000-000000000010' and event_type = 'PAID') = 1, 'no duplicate PAID event');
-- 두 번째 선결제는 거절된다
select pg_temp.pay(110, '00000300-0001-4000-8000-000000000010');
select pg_temp.denied($q$select public.finalize_payment('00000300-0002-4000-8000-000000000110', 'T300-TID-110', now())$q$, 'second prepayment rejected');
-- 취소된 예약의 승인은 확정되지 않는다(예외 → 승인 라우트가 PG 승인 취소)
select pg_temp.mk(12, '00000300-0000-4000-8000-000000000002', 'admin_direct');
update public.reservations set status = 'CANCELLED' where code = 'T300-12';
select pg_temp.pay(12, '00000300-0001-4000-8000-000000000012');
select pg_temp.denied($q$select public.finalize_payment('00000300-0002-4000-8000-000000000012', 'T300-TID-12', now())$q$, 'cancelled reservation cannot be paid into the queue');
-- 신규 방식 쿠폰 전제 — 파트너 선택 없이 결제 기한만으로 확보 가능
update public.reservations set payment_deadline = now() + interval '10 minutes' where code = 'T300-11';
select pg_temp.assert(public.opening_event_live_hold((select id from public.payments where order_id = 'T300-ORDER-11')) is false, 'live_hold false for non-PENDING');

-- =============================================================
-- 4. 만료 정리 보호 — 결제 완료 매칭 대기는 취소하지 않는다
-- =============================================================
select pg_temp.mk(30, '00000300-0000-4000-8000-000000000002', 'admin_direct', -48);   -- 결제 완료·시작 시각 경과
select pg_temp.mk(31, '00000300-0000-4000-8000-000000000002', 'admin_direct', -48);   -- 미결제·시작 시각 경과
select pg_temp.mk(32, '00000300-0000-4000-8000-000000000002', 'legacy_auto', -48);    -- 기존 방식·시작 시각 경과
select pg_temp.pay(30, '00000300-0001-4000-8000-000000000030');
select public.finalize_payment('00000300-0002-4000-8000-000000000030', 'T300-TID-30', now());
select pg_temp.assert(public.expire_past_matchings() >= 2, 'sweep ran');
select pg_temp.assert((select status::text from public.reservations where code = 'T300-30') = 'MATCHING', 'paid admin_direct survives expiry');
select pg_temp.assert((select status::text from public.reservations where code = 'T300-31') = 'CANCELLED', 'unpaid admin_direct expires as before');
select pg_temp.assert((select status::text from public.reservations where code = 'T300-32') = 'CANCELLED', 'legacy expires as before');
-- 결제 승인 진행 중(PENDING)인 신규 방식은 건드리지 않는다
select pg_temp.mk(33, '00000300-0000-4000-8000-000000000002', 'admin_direct', -48);
select pg_temp.pay(33, '00000300-0001-4000-8000-000000000033');
select public.expire_past_matchings();
select pg_temp.assert((select status::text from public.reservations where code = 'T300-33') = 'MATCHING', 'in-flight payment protected from expiry');
-- 결제 후 24시간 경과 — 자동 실패·환불이 없다
update public.reservations set paid_at = now() - interval '30 hours' where code = 'T300-30';
select public.run_expiry_sweep();
select pg_temp.assert((select status::text from public.reservations where code = 'T300-30') = 'MATCHING', 'no auto-fail after 24h');
select pg_temp.assert(not exists (select 1 from public.reservation_refunds where reservation_id = '00000300-0001-4000-8000-000000000030'), 'no auto refund after 24h');
-- release_expired_selections 는 신규 방식 결제 기한을 건드리지 않는다
update public.reservations set payment_deadline = now() - interval '1 minute' where code = 'T300-33';
select public.release_expired_selections();
select pg_temp.assert((select payment_deadline is not null from public.reservations where code = 'T300-33'), 'selection release ignores admin_direct');

-- =============================================================
-- 5. 운영자 접수 큐 — 임대·재시도·확인
-- =============================================================
-- 이전 테스트가 만든 다른 접수는 처리 대상에서 빼기 위해 SENT 로 돌려 둔다
update public.reservation_intakes set notify_status = 'SENT', sent_at = now() where reservation_id <> '00000300-0001-4000-8000-000000000010';
select pg_temp.assert((select count(*) from public.claim_intake_notifications(10)) = 1, 'claim picks the pending intake');
select pg_temp.assert((select notify_status from public.reservation_intakes where reservation_id = '00000300-0001-4000-8000-000000000010') = 'SENDING', 'claimed row is leased');
select pg_temp.assert((select count(*) from public.claim_intake_notifications(10)) = 0, 'leased row is not picked twice');
select public.record_intake_notification_result((select id from public.reservation_intakes where reservation_id = '00000300-0001-4000-8000-000000000010'), false, 'Resend 500');
select pg_temp.assert((select notify_status = 'FAILED' and last_error = 'Resend 500' and next_attempt_at > now() from public.reservation_intakes where reservation_id = '00000300-0001-4000-8000-000000000010'), 'failure backs off');
select pg_temp.assert((select count(*) from public.claim_intake_notifications(10)) = 0, 'not retried before backoff');
update public.reservation_intakes set next_attempt_at = now() - interval '1 second' where reservation_id = '00000300-0001-4000-8000-000000000010';
select pg_temp.assert((select count(*) from public.claim_intake_notifications(10)) = 1, 'retried after backoff');
select pg_temp.assert((select attempts from public.reservation_intakes where reservation_id = '00000300-0001-4000-8000-000000000010') = 2, 'attempt counter incremented');
select public.record_intake_notification_result((select id from public.reservation_intakes where reservation_id = '00000300-0001-4000-8000-000000000010'), true);
select pg_temp.assert((select notify_status = 'SENT' and sent_at is not null from public.reservation_intakes where reservation_id = '00000300-0001-4000-8000-000000000010'), 'success recorded');
update public.reservation_intakes set next_attempt_at = now() - interval '1 second' where reservation_id = '00000300-0001-4000-8000-000000000010';
select pg_temp.assert((select count(*) from public.claim_intake_notifications(10)) = 0, 'SENT is never re-sent');
select public.record_intake_notification_result((select id from public.reservation_intakes where reservation_id = '00000300-0001-4000-8000-000000000010'), false, 'late failure');
select pg_temp.assert((select notify_status from public.reservation_intakes where reservation_id = '00000300-0001-4000-8000-000000000010') = 'SENT', 'late failure cannot downgrade SENT');

-- 권한: 서버 전용 함수는 로그인 사용자가 부를 수 없다
select pg_temp.as_user('00000300-0000-4000-8000-000000000001', 'ADMIN');
set local role authenticated;
select pg_temp.denied($q$select * from public.claim_intake_notifications(1)$q$, 'authenticated cannot claim intakes');
select pg_temp.denied($q$select public.mark_reservation_paid('00000300-0001-4000-8000-000000000010', '00000300-0002-4000-8000-000000000010')$q$, 'authenticated cannot mark paid');
select pg_temp.denied($q$select public.complete_direct_refund(gen_random_uuid())$q$, 'authenticated cannot complete refund');
reset role;

-- =============================================================
-- 6. 관리자 권한 · 목록 · 접수 확인
-- =============================================================
select pg_temp.as_user('00000300-0000-4000-8000-000000000002');          -- 일반 사용자
set local role authenticated;
select pg_temp.denied($q$select * from public.admin_list_waiting_reservations()$q$, 'user cannot list waiting');
select pg_temp.denied($q$select public.admin_assign_partner('00000300-0001-4000-8000-000000000010', '00000300-0000-4000-8000-000000000011', 'PHONE')$q$, 'user cannot assign');
select pg_temp.assert((select count(*) from public.reservation_events) = 0, 'customer sees no events (RLS)');
select pg_temp.assert((select count(*) from public.reservation_intakes) = 0, 'customer sees no intakes (RLS)');
select pg_temp.assert((select count(*) from public.reservation_refunds) = 0, 'customer sees no refunds (RLS)');
reset role;
select pg_temp.as_user('00000300-0000-4000-8000-000000000011', 'PARTNER');  -- 파트너
set local role authenticated;
select pg_temp.denied($q$select public.admin_assign_partner('00000300-0001-4000-8000-000000000010', '00000300-0000-4000-8000-000000000011', 'PHONE')$q$, 'partner cannot self-assign');
reset role;
select pg_temp.as_user('00000300-0000-4000-8000-000000000001', 'ADMIN', 'aal1');   -- MFA 없음
set local role authenticated;
select pg_temp.denied($q$select * from public.admin_list_waiting_reservations()$q$, 'admin without MFA denied');
reset role;
select pg_temp.as_user('00000300-0000-4000-8000-000000000009', 'ADMIN');            -- 계정 담당(예약 권한 없음)
set local role authenticated;
select pg_temp.denied($q$select public.admin_assign_partner('00000300-0001-4000-8000-000000000010', '00000300-0000-4000-8000-000000000011', 'PHONE')$q$, 'wrong duty denied');
reset role;

-- 24시간 임박·경과 표시 (한국 시간 기준 시각 비교, ±10분 여유로 경계를 본다)
select pg_temp.mk(40, '00000300-0000-4000-8000-000000000002', 'admin_direct', 23.8);   -- 24시간 미만
select pg_temp.mk(41, '00000300-0000-4000-8000-000000000002', 'admin_direct', 24.2);   -- 24시간 초과
select pg_temp.pay(40, '00000300-0001-4000-8000-000000000040');
select pg_temp.pay(41, '00000300-0001-4000-8000-000000000041');
select public.finalize_payment('00000300-0002-4000-8000-000000000040', 'T300-TID-40', now());
select public.finalize_payment('00000300-0002-4000-8000-000000000041', 'T300-TID-41', now());
select pg_temp.as_user('00000300-0000-4000-8000-000000000001', 'ADMIN');
set local role authenticated;
select pg_temp.assert((select urgent from public.admin_list_waiting_reservations() where code = 'T300-40'), 'under 24h before start is urgent');
select pg_temp.assert(not (select urgent from public.admin_list_waiting_reservations() where code = 'T300-41'), 'over 24h before start is not urgent');
select pg_temp.assert((select overdue from public.admin_list_waiting_reservations() where code = 'T300-30'), 'paid 30h ago is overdue');
select pg_temp.assert(not (select overdue from public.admin_list_waiting_reservations() where code = 'T300-40'), 'just paid is not overdue');
select pg_temp.assert((select count(*) from public.admin_list_waiting_reservations() where code in ('T300-31', 'T300-32')) = 0, 'cancelled/unpaid rows are not listed');
select public.admin_acknowledge_intake('00000300-0001-4000-8000-000000000040', '확인');
select public.admin_acknowledge_intake('00000300-0001-4000-8000-000000000040', '다시');
select pg_temp.assert((select acknowledge_memo from public.reservation_intakes where reservation_id = '00000300-0001-4000-8000-000000000040') = '확인', 'acknowledge is once and keeps the first memo');
select pg_temp.assert((select count(*) from public.reservation_events where reservation_id = '00000300-0001-4000-8000-000000000040' and event_type = 'INTAKE_ACKNOWLEDGED') = 1, 'acknowledge event once');
select pg_temp.assert((select count(*) from public.reservation_events) > 0, 'admin sees events (RLS)');
reset role;
select pg_temp.assert(exists (select 1 from public.access_logs where action = 'RESERVATION_WAITING_LIST' and actor_id = '00000300-0000-4000-8000-000000000001'), 'list access is logged');

-- =============================================================
-- 7. 배정 · 재배정
-- =============================================================
select pg_temp.as_user('00000300-0000-4000-8000-000000000001', 'ADMIN');
set local role authenticated;
-- 결제 전·기존 방식은 배정할 수 없다
select pg_temp.denied($q$select public.admin_assign_partner('00000300-0001-4000-8000-000000000033', '00000300-0000-4000-8000-000000000011', 'PHONE')$q$, 'unpaid cannot be assigned');
select pg_temp.denied($q$select public.admin_assign_partner('00000300-0001-4000-8000-000000000002', '00000300-0000-4000-8000-000000000011', 'PHONE')$q$, 'legacy reservation is not assignable here');
-- 활동 불가·비파트너·잘못된 수락 채널·시작 시각 경과
select pg_temp.denied($q$select public.admin_assign_partner('00000300-0001-4000-8000-000000000010', '00000300-0000-4000-8000-000000000013', 'PHONE')$q$, 'suspended partner rejected');
select pg_temp.denied($q$select public.admin_assign_partner('00000300-0001-4000-8000-000000000010', '00000300-0000-4000-8000-000000000003', 'PHONE')$q$, 'non-partner rejected');
select pg_temp.denied($q$select public.admin_assign_partner('00000300-0001-4000-8000-000000000010', '00000300-0000-4000-8000-000000000011', 'CARRIER_PIGEON')$q$, 'invalid accept channel rejected');
select pg_temp.denied($q$select public.admin_assign_partner('00000300-0001-4000-8000-000000000030', '00000300-0000-4000-8000-000000000011', 'PHONE')$q$, 'start time passed cannot be assigned');
select pg_temp.denied($q$select public.admin_assign_partner('00000300-0001-4000-8000-000000000010', '00000300-0000-4000-8000-000000000011', 'PHONE', null, now() + interval '1 day')$q$, 'future acceptance time rejected');
select pg_temp.denied($q$select public.admin_assign_partner('00000300-0001-4000-8000-000000000010', '00000300-0000-4000-8000-000000000011', 'PHONE', null, null, 'REASSIGN')$q$, 'stale expected action rejected');

-- 정상 배정: 수락 확인(수행자·시각·메모) 기록 + 확정 + services 생성
select pg_temp.assert((public.admin_assign_partner('00000300-0001-4000-8000-000000000010', '00000300-0000-4000-8000-000000000011', 'PHONE', '전화로 수락 확인', null, 'ASSIGN')->>'action') = 'ASSIGNED', 'assign succeeds');
reset role;
select pg_temp.assert((select status::text from public.reservations where code = 'T300-10') = 'CONFIRMED', 'assignment confirms');
select pg_temp.assert((select confirmed_partner_id from public.reservations where code = 'T300-10') = '00000300-0000-4000-8000-000000000011', 'partner stored');
select pg_temp.assert((select assigned_by = '00000300-0000-4000-8000-000000000001' and assigned_at is not null and partner_accepted_at is not null
  and partner_accepted_channel = 'PHONE' and partner_accepted_memo = '전화로 수락 확인' from public.reservations where code = 'T300-10'), 'acceptance recorded with actor, time, memo');
select pg_temp.assert((select partner_id from public.services where reservation_id = '00000300-0001-4000-8000-000000000010') = '00000300-0000-4000-8000-000000000011', 'service created for partner');
select pg_temp.assert((select acknowledged_at is not null from public.reservation_intakes where reservation_id = '00000300-0001-4000-8000-000000000010'), 'assignment acknowledges intake');
select pg_temp.assert((select count(*) from public.reservation_events where reservation_id = '00000300-0001-4000-8000-000000000010' and event_type = 'ASSIGNED' and actor_id = '00000300-0000-4000-8000-000000000001') = 1, 'ASSIGNED audit event');
select pg_temp.assert(exists (select 1 from public.access_logs where action = 'RESERVATION_ASSIGN' and target_id = '00000300-0001-4000-8000-000000000010'), 'assignment access log');
select pg_temp.assert(exists (select 1 from public.notifications where dedupe_key = 'direct-assigned:00000300-0001-4000-8000-000000000010:00000300-0000-4000-8000-000000000011')
  and exists (select 1 from public.notifications where dedupe_key = 'direct-confirmed:00000300-0001-4000-8000-000000000010:00000300-0000-4000-8000-000000000011'), 'partner and customer notified');
-- 새 담당자는 확정 이후 단계 2 정보를 본다. 배정되지 않은 파트너는 보지 못한다.
select pg_temp.as_user('00000300-0000-4000-8000-000000000011', 'PARTNER');
set local role authenticated;
select pg_temp.assert(public.partner_can_access('00000300-0001-4000-8000-000000000010') is true, 'assigned partner can access');
select pg_temp.assert((select count(*) from public.reservations where id = '00000300-0001-4000-8000-000000000010') = 1, 'assigned partner reads the reservation row (RLS)');
reset role;
select pg_temp.as_user('00000300-0000-4000-8000-000000000012', 'PARTNER');
set local role authenticated;
select pg_temp.assert(public.partner_can_access('00000300-0001-4000-8000-000000000010') is false, 'other partner cannot access');
select pg_temp.assert((select count(*) from public.reservations where id = '00000300-0001-4000-8000-000000000010') = 0, 'other partner cannot read row');
reset role;

-- 같은 건을 다시 배정하려 하면 같은 담당자 거절 / 상태 불일치(ASSIGN 기대) 거절
select pg_temp.as_user('00000300-0000-4000-8000-000000000001', 'ADMIN');
set local role authenticated;
select pg_temp.denied($q$select public.admin_assign_partner('00000300-0001-4000-8000-000000000010', '00000300-0000-4000-8000-000000000011', 'PHONE')$q$, 'reassign to the same partner rejected');
select pg_temp.denied($q$select public.admin_assign_partner('00000300-0001-4000-8000-000000000010', '00000300-0000-4000-8000-000000000012', 'PHONE', null, null, 'ASSIGN')$q$, 'double-assign (stale ASSIGN) rejected');
reset role;

-- 일정 중복: P1 이 이미 T300-10 을 가지고 있다. 같은 시각 건 배정은 거절, 다른 날은 허용.
select pg_temp.mk(50, '00000300-0000-4000-8000-000000000003', 'admin_direct', 72);
select pg_temp.mk(51, '00000300-0000-4000-8000-000000000003', 'admin_direct', 200);
update public.reservations set use_date = (select use_date from public.reservations where code = 'T300-10'),
  arrive_time = (select arrive_time from public.reservations where code = 'T300-10') where code = 'T300-50';
select pg_temp.pay(50, '00000300-0001-4000-8000-000000000050');
select pg_temp.pay(51, '00000300-0001-4000-8000-000000000051');
select public.finalize_payment('00000300-0002-4000-8000-000000000050', 'T300-TID-50', now());
select public.finalize_payment('00000300-0002-4000-8000-000000000051', 'T300-TID-51', now());
select pg_temp.as_user('00000300-0000-4000-8000-000000000001', 'ADMIN');
set local role authenticated;
select pg_temp.denied($q$select public.admin_assign_partner('00000300-0001-4000-8000-000000000050', '00000300-0000-4000-8000-000000000011', 'PHONE')$q$, 'overlapping schedule rejected');
select pg_temp.assert((select conflict from public.admin_list_assignable_partners('00000300-0001-4000-8000-000000000050') where partner_id = '00000300-0000-4000-8000-000000000011'), 'candidate list flags the conflict');
select pg_temp.assert(not exists (select 1 from public.admin_list_assignable_partners('00000300-0001-4000-8000-000000000050') where partner_id = '00000300-0000-4000-8000-000000000013'), 'candidate list hides suspended partners');
select public.admin_assign_partner('00000300-0001-4000-8000-000000000051', '00000300-0000-4000-8000-000000000011', 'SMS');
reset role;
select pg_temp.assert((select status::text from public.reservations where code = 'T300-51') = 'CONFIRMED', 'non-overlapping assignment allowed');

-- 확정 안내 문자 완료 기록 — 담당 파트너만, 한 번만
select pg_temp.as_user('00000300-0000-4000-8000-000000000012', 'PARTNER');
set local role authenticated;
select pg_temp.denied($q$select public.partner_record_customer_notice('00000300-0001-4000-8000-000000000010', '다른 파트너')$q$, 'unassigned partner cannot record notice');
reset role;
select pg_temp.as_user('00000300-0000-4000-8000-000000000002');
set local role authenticated;
select pg_temp.denied($q$select public.partner_record_customer_notice('00000300-0001-4000-8000-000000000010')$q$, 'customer cannot record notice');
reset role;
select pg_temp.as_user('00000300-0000-4000-8000-000000000011', 'PARTNER');
set local role authenticated;
select public.partner_record_customer_notice('00000300-0001-4000-8000-000000000010', '문자 발송함');
select public.partner_record_customer_notice('00000300-0001-4000-8000-000000000010', '다시');
reset role;
select pg_temp.assert((select customer_notice_at is not null and customer_notice_by = '00000300-0000-4000-8000-000000000011' and customer_notice_memo = '문자 발송함' from public.reservations where code = 'T300-10'), 'notice recorded once with actor and memo');
select pg_temp.assert((select count(*) from public.reservation_events where reservation_id = '00000300-0001-4000-8000-000000000010' and event_type = 'CUSTOMER_NOTICE_DONE') = 1, 'notice audit event once');

-- 재배정: 서비스 시작 전 → 담당자·권한·일정 교체, 문자 안내 기록 초기화, 이력
select pg_temp.as_user('00000300-0000-4000-8000-000000000001', 'ADMIN');
set local role authenticated;
select pg_temp.assert((public.admin_assign_partner('00000300-0001-4000-8000-000000000010', '00000300-0000-4000-8000-000000000012', 'KAKAO', '재배정', null, 'REASSIGN')->>'action') = 'REASSIGNED', 'reassign before start succeeds');
reset role;
select pg_temp.assert((select partner_id from public.services where reservation_id = '00000300-0001-4000-8000-000000000010') = '00000300-0000-4000-8000-000000000012', 'service moves to the new partner');
select pg_temp.assert((select confirmed_partner_id from public.reservations where code = 'T300-10') = '00000300-0000-4000-8000-000000000012', 'reservation moves to the new partner');
select pg_temp.assert((select customer_notice_at is null from public.reservations where code = 'T300-10'), 'notice record reset for the new partner');
select pg_temp.assert((select count(*) from public.reservation_events where reservation_id = '00000300-0001-4000-8000-000000000010' and event_type = 'REASSIGNED' and (detail->>'previous_partner_id') = '00000300-0000-4000-8000-000000000011') = 1, 'REASSIGNED event keeps previous partner');
select pg_temp.assert((select status::text from public.reservations where code = 'T300-10') = 'CONFIRMED', 'still confirmed after reassignment');
select pg_temp.as_user('00000300-0000-4000-8000-000000000011', 'PARTNER');   -- 이전 담당자
set local role authenticated;
select pg_temp.assert(public.partner_can_access('00000300-0001-4000-8000-000000000010') is false, 'previous partner loses access');
select pg_temp.assert((select count(*) from public.services where reservation_id = '00000300-0001-4000-8000-000000000010') = 0, 'previous partner loses the service row (RLS)');
reset role;
select pg_temp.as_user('00000300-0000-4000-8000-000000000012', 'PARTNER');   -- 새 담당자는 기존 수행 기능을 이용한다
set local role authenticated;
select pg_temp.assert(public.partner_can_access('00000300-0001-4000-8000-000000000010') is true, 'new partner has access');
reset role;
-- 시작 버튼은 예정 시각 전에는 막혀 있으므로(too_early) 시작된 상태를 직접 만든다
update public.services set status = 'IN_PROGRESS', started_at = now() where reservation_id = '00000300-0001-4000-8000-000000000010';
-- 서비스 시작 후에는 재배정 불가
select pg_temp.as_user('00000300-0000-4000-8000-000000000001', 'ADMIN');
set local role authenticated;
select pg_temp.denied($q$select public.admin_assign_partner('00000300-0001-4000-8000-000000000010', '00000300-0000-4000-8000-000000000011', 'PHONE')$q$, 'reassign after start blocked');
-- 확정(배정 후) 예약은 배정 전 전액 환불 경로로 취소할 수 없다
reset role;
select pg_temp.as_user('00000300-0000-4000-8000-000000000002');
set local role authenticated;
select pg_temp.denied($q$select public.customer_cancel_before_assignment('00000300-0001-4000-8000-000000000010')$q$, 'assigned reservation is not refundable through the pre-assignment path');
reset role;

-- =============================================================
-- 8. 배정 전 고객 취소 — 전액 환불 (포인트 복원)
-- =============================================================
-- 포인트 3,000원을 쓴 결제(실결제 37,000원)
insert into public.points(user_id, amount, reason, memo) values ('00000300-0000-4000-8000-000000000003', 10000, 'COMPENSATION', 'test seed');
select pg_temp.mk(60, '00000300-0000-4000-8000-000000000003', 'admin_direct', 100);
select pg_temp.pay(60, '00000300-0001-4000-8000-000000000060', 'PENDING', 3000);
select public.spend_points('00000300-0002-4000-8000-000000000060', 3000);
select public.finalize_payment('00000300-0002-4000-8000-000000000060', 'T300-TID-60', now());
select pg_temp.assert(public.point_balance('00000300-0000-4000-8000-000000000003') = 7000, 'points spent before refund');

select pg_temp.as_user('00000300-0000-4000-8000-000000000002');   -- 다른 고객은 취소할 수 없다
set local role authenticated;
select pg_temp.denied($q$select public.customer_cancel_before_assignment('00000300-0001-4000-8000-000000000060')$q$, 'non-owner cannot cancel');
reset role;
select pg_temp.as_user('00000300-0000-4000-8000-000000000003');
set local role authenticated;
select pg_temp.assert(public.cancel_matching_reservation('00000300-0001-4000-8000-000000000060') is false, 'generic cancel refuses a paid admin_direct reservation');
select pg_temp.assert((public.customer_cancel_before_assignment('00000300-0001-4000-8000-000000000060')->>'amount_cash')::int = 37000, 'cancel opens a refund of the cash actually paid');
select pg_temp.assert((public.customer_cancel_before_assignment('00000300-0001-4000-8000-000000000060')->>'already')::boolean, 'repeat cancel is idempotent');
reset role;
select pg_temp.assert((select status::text from public.reservations where code = 'T300-60') = 'CANCELLED', 'reservation closed at once (no later assignment)');
select pg_temp.assert((select status from public.reservation_refunds where reservation_id = '00000300-0001-4000-8000-000000000060') = 'REQUESTED', 'refund is requested, not completed');
select pg_temp.assert(not exists (select 1 from public.payments where reservation_id = '00000300-0001-4000-8000-000000000060' and type = 'REFUND'), 'no refund ledger row before the PG cancel');
select pg_temp.assert(public.point_balance('00000300-0000-4000-8000-000000000003') = 7000, 'points not restored before the PG cancel');
-- 취소 후 배정은 불가
select pg_temp.as_user('00000300-0000-4000-8000-000000000001', 'ADMIN');
set local role authenticated;
select pg_temp.denied($q$select public.admin_assign_partner('00000300-0001-4000-8000-000000000060', '00000300-0000-4000-8000-000000000011', 'PHONE')$q$, 'cancelled reservation cannot be assigned');
reset role;

-- PG 취소 실패 → 환불 완료로 표시되지 않는다. 임대가 동시 호출을 막는다.
select pg_temp.assert((public.claim_direct_refund((select id from public.reservation_refunds where reservation_id = '00000300-0001-4000-8000-000000000060'))->>'proceed')::boolean, 'claim proceeds');
select pg_temp.assert(not (public.claim_direct_refund((select id from public.reservation_refunds where reservation_id = '00000300-0001-4000-8000-000000000060'))->>'proceed')::boolean, 'second claim is blocked while leased (no double PG cancel)');
select public.fail_direct_refund((select id from public.reservation_refunds where reservation_id = '00000300-0001-4000-8000-000000000060'), 'PG down');
select pg_temp.assert((select status = 'PG_FAILED' and last_error = 'PG down' and completed_at is null from public.reservation_refunds where reservation_id = '00000300-0001-4000-8000-000000000060'), 'PG failure is tracked, not completed');
select pg_temp.denied($q$select public.complete_direct_refund((select id from public.reservation_refunds where reservation_id = '00000300-0001-4000-8000-000000000060'))$q$, 'cannot complete without the PG cancel');
select pg_temp.assert(not exists (select 1 from public.payments where reservation_id = '00000300-0001-4000-8000-000000000060' and type = 'REFUND'), 'still no refund ledger row after the failure');
select pg_temp.assert(public.point_balance('00000300-0000-4000-8000-000000000003') = 7000, 'points still not restored after the failure');
select pg_temp.assert(exists (select 1 from public.reservation_events where reservation_id = '00000300-0001-4000-8000-000000000060' and event_type = 'REFUND_PG_FAILED'), 'failure event recorded');
-- 운영자 추적·재시도
select pg_temp.as_user('00000300-0000-4000-8000-000000000001', 'ADMIN');
set local role authenticated;
select pg_temp.assert(exists (select 1 from public.admin_list_direct_refund_issues() where code = 'T300-60' and refund_status = 'PG_FAILED'), 'operator sees the failed refund');
select pg_temp.assert((select status from public.reservation_refunds where reservation_id = '00000300-0001-4000-8000-000000000060') = 'PG_FAILED', 'operator can read refund status');
select public.admin_retry_direct_refund('00000300-0001-4000-8000-000000000060');
reset role;
select pg_temp.assert((select status from public.reservation_refunds where reservation_id = '00000300-0001-4000-8000-000000000060') = 'REQUESTED', 'retry reopens the refund');
-- 재시도 → PG 성공 → 원장 기록
select pg_temp.assert((public.claim_direct_refund((select id from public.reservation_refunds where reservation_id = '00000300-0001-4000-8000-000000000060'))->>'proceed')::boolean, 'retry claim proceeds');
select public.mark_direct_refund_pg_done((select id from public.reservation_refunds where reservation_id = '00000300-0001-4000-8000-000000000060'), '{"ok":true}');
select pg_temp.assert((public.complete_direct_refund((select id from public.reservation_refunds where reservation_id = '00000300-0001-4000-8000-000000000060'))->>'restored_points')::int = 3000, 'complete restores the points');
select pg_temp.assert((select status = 'REFUNDED' and completed_at is not null from public.reservation_refunds where reservation_id = '00000300-0001-4000-8000-000000000060'), 'refund completed');
select pg_temp.assert((select -gross_amount - (-discount_amount) from public.payments where reservation_id = '00000300-0001-4000-8000-000000000060' and type = 'REFUND') = 37000, 'refund ledger row is the full cash amount');
select pg_temp.assert((select cancel_fee_amount from public.payments where reservation_id = '00000300-0001-4000-8000-000000000060' and type = 'REFUND') = 0, 'no cancel fee before assignment');
select pg_temp.assert(public.point_balance('00000300-0000-4000-8000-000000000003') = 10000, 'points fully restored');
select pg_temp.assert((select status::text from public.reservations where code = 'T300-60') = 'CANCELLED', 'reservation stays cancelled');
-- 완료 재호출은 멱등 — 이중 환불·이중 복원 없음
select pg_temp.assert((public.complete_direct_refund((select id from public.reservation_refunds where reservation_id = '00000300-0001-4000-8000-000000000060'))->>'already')::boolean, 'complete is idempotent');
select pg_temp.assert((select count(*) from public.payments where reservation_id = '00000300-0001-4000-8000-000000000060' and type = 'REFUND') = 1, 'exactly one refund row');
select pg_temp.assert(public.point_balance('00000300-0000-4000-8000-000000000003') = 10000, 'points restored once');
select pg_temp.assert(not (public.claim_direct_refund((select id from public.reservation_refunds where reservation_id = '00000300-0001-4000-8000-000000000060'))->>'proceed')::boolean, 'REFUNDED is never claimed again');
select pg_temp.assert(exists (select 1 from public.reservation_events where reservation_id = '00000300-0001-4000-8000-000000000060' and event_type = 'REFUND_COMPLETED'), 'completion event recorded');

-- =============================================================
-- 9. 운영자 매칭 실패 — 전액 환불 · 실패 안내 완료 기록 · 이벤트 쿠폰 복원
-- =============================================================
-- 쿠폰 사용 결제(캠페인 진행 중): 현금 20,000원 + 쿠폰 20,000원
update public.opening_campaign set used_count = 0, ends_at = now() + interval '30 days', closed_at = null, active = true where id;
select pg_temp.mk(70, '00000300-0000-4000-8000-000000000002', 'admin_direct', 100);
select pg_temp.pay(70, '00000300-0001-4000-8000-000000000070', 'PENDING', 20000);
update public.payments set campaign_discount_amount = 20000 where id = '00000300-0002-4000-8000-000000000070';
insert into public.opening_event_identities(customer_id, identity_hash, verification_source, verified_at)
  values ('00000300-0000-4000-8000-000000000002', (md5('t300')||md5('t300')), 'SUPABASE_EMAIL', now());
insert into public.opening_event_claims(customer_id, identity_hash, payment_id, reservation_id, discount_amount, state, sequence, confirmed_at, expires_at)
  values ('00000300-0000-4000-8000-000000000002', (md5('t300')||md5('t300')), '00000300-0002-4000-8000-000000000070', '00000300-0001-4000-8000-000000000070',
          20000, 'HELD', null, null, now() + interval '10 minutes');
update public.reservations set payment_deadline = now() + interval '10 minutes' where code = 'T300-70';
select public.finalize_payment('00000300-0002-4000-8000-000000000070', 'T300-TID-70', now());
select pg_temp.assert((select state from public.opening_event_claims where payment_id = '00000300-0002-4000-8000-000000000070') = 'USED', 'coupon is used when the unassigned prepayment is approved');

select pg_temp.as_user('00000300-0000-4000-8000-000000000011', 'PARTNER');
set local role authenticated;
select pg_temp.denied($q$select public.admin_fail_matching('00000300-0001-4000-8000-000000000070', '매칭 불가 사유 확인')$q$, 'partner cannot fail matching');
reset role;
select pg_temp.as_user('00000300-0000-4000-8000-000000000001', 'ADMIN');
set local role authenticated;
select pg_temp.denied($q$select public.admin_fail_matching('00000300-0001-4000-8000-000000000070', '짧음')$q$, 'failure reason required');
select pg_temp.denied($q$select public.admin_record_failure_notice('00000300-0001-4000-8000-000000000070', 'PHONE')$q$, 'failure notice needs a failed match first');
select pg_temp.assert((public.admin_fail_matching('00000300-0001-4000-8000-000000000070', '활동 가능한 파트너가 없음')->>'amount_cash')::int = 20000, 'match failure opens a full cash refund');
select public.admin_record_failure_notice('00000300-0001-4000-8000-000000000070', 'PHONE', '전화로 안내함');
select public.admin_record_failure_notice('00000300-0001-4000-8000-000000000070', 'SMS', '다시');
select pg_temp.denied($q$select public.admin_record_failure_notice('00000300-0001-4000-8000-000000000070', 'FAX')$q$, 'invalid notice method rejected');
reset role;
select pg_temp.assert((select match_failed_at is not null and match_failed_by = '00000300-0000-4000-8000-000000000001' and match_failure_reason = '활동 가능한 파트너가 없음' and cancel_reason = 'ADMIN'
  from public.reservations where code = 'T300-70'), 'match failure recorded with actor and reason');
select pg_temp.assert((select failure_notice_at is not null and failure_notice_by = '00000300-0000-4000-8000-000000000001' and failure_notice_method = 'PHONE' and failure_notice_memo = '전화로 안내함'
  from public.reservations where code = 'T300-70'), 'failure notice recorded once with method, actor, memo');
select pg_temp.assert((select count(*) from public.reservation_events where reservation_id = '00000300-0001-4000-8000-000000000070' and event_type = 'FAILURE_NOTICE_DONE') = 1, 'failure notice event once');
-- 환불 상태와 매칭 실패·안내 상태는 별개로 확인된다 (환불은 아직 REQUESTED)
select pg_temp.assert((select status from public.reservation_refunds where reservation_id = '00000300-0001-4000-8000-000000000070') = 'REQUESTED', 'refund state is separate from the failure state');
select public.mark_direct_refund_pg_done((select id from public.reservation_refunds where reservation_id = '00000300-0001-4000-8000-000000000070'));
select public.complete_direct_refund((select id from public.reservation_refunds where reservation_id = '00000300-0001-4000-8000-000000000070'));
select pg_temp.assert((select state = 'RELEASED' and restored_at is not null from public.opening_event_claims where payment_id = '00000300-0002-4000-8000-000000000070'), 'coupon restored while the campaign is open');
select pg_temp.assert((select used_count from public.opening_campaign where id) = 0, 'coupon slot returned to the campaign');
select pg_temp.assert((select coupon_restored from public.reservation_refunds where reservation_id = '00000300-0001-4000-8000-000000000070'), 'restore recorded on the refund');

-- 행사 종료 후에는 복원하지 않고 생략을 기록한다 (#297)
update public.opening_campaign set used_count = 1, ends_at = now() - interval '1 day' where id;
select pg_temp.mk(71, '00000300-0000-4000-8000-000000000003', 'admin_direct', 100);
select pg_temp.pay(71, '00000300-0001-4000-8000-000000000071', 'PAID', 20000);
update public.payments set campaign_discount_amount = 20000, paid_at = now() where id = '00000300-0002-4000-8000-000000000071';
insert into public.opening_event_identities(customer_id, identity_hash, verification_source, verified_at)
  values ('00000300-0000-4000-8000-000000000003', (md5('t300b')||md5('t300b')), 'SUPABASE_EMAIL', now());
insert into public.opening_event_claims(customer_id, identity_hash, payment_id, reservation_id, discount_amount, state, sequence, confirmed_at, expires_at)
  values ('00000300-0000-4000-8000-000000000003', (md5('t300b')||md5('t300b')), '00000300-0002-4000-8000-000000000071', '00000300-0001-4000-8000-000000000071',
          20000, 'USED', 1, now(), now());
update public.reservations set status = 'MATCHING', paid_at = now() where code = 'T300-71';
select public.begin_direct_refund('00000300-0001-4000-8000-000000000071', 'MATCH_FAILED', '테스트');
select public.mark_direct_refund_pg_done((select id from public.reservation_refunds where reservation_id = '00000300-0001-4000-8000-000000000071'));
select public.complete_direct_refund((select id from public.reservation_refunds where reservation_id = '00000300-0001-4000-8000-000000000071'));
select pg_temp.assert((select state from public.opening_event_claims where payment_id = '00000300-0002-4000-8000-000000000071') = 'USED', 'ended campaign: coupon is not restored');
select pg_temp.assert((select coupon_restore_skipped and not coupon_restored from public.reservation_refunds where reservation_id = '00000300-0001-4000-8000-000000000071'), 'ended campaign: skip is recorded');
select pg_temp.assert((select used_count from public.opening_campaign where id) = 1, 'ended campaign: used_count untouched');

-- =============================================================
-- 10. 수동 PG 확인(응답 유실) — 이후 재시도는 PG 를 다시 부르지 않는다
-- =============================================================
select pg_temp.mk(80, '00000300-0000-4000-8000-000000000002', 'admin_direct', 100);
select pg_temp.pay(80, '00000300-0001-4000-8000-000000000080');
select public.finalize_payment('00000300-0002-4000-8000-000000000080', 'T300-TID-80', now());
select public.begin_direct_refund('00000300-0001-4000-8000-000000000080', 'MATCH_FAILED', '테스트');
select public.claim_direct_refund((select id from public.reservation_refunds where reservation_id = '00000300-0001-4000-8000-000000000080'));
select public.fail_direct_refund((select id from public.reservation_refunds where reservation_id = '00000300-0001-4000-8000-000000000080'), 'timeout');
select pg_temp.as_user('00000300-0000-4000-8000-000000000001', 'ADMIN');
set local role authenticated;
select pg_temp.denied($q$select public.admin_mark_refund_pg_cancelled('00000300-0001-4000-8000-000000000080', '짧')$q$, 'manual confirmation needs a memo');
select public.admin_mark_refund_pg_cancelled('00000300-0001-4000-8000-000000000080', 'PG 콘솔에서 취소 완료 확인');
reset role;
select pg_temp.assert((public.claim_direct_refund((select id from public.reservation_refunds where reservation_id = '00000300-0001-4000-8000-000000000080'))->>'pg_done')::boolean, 'claim reports the PG cancel as already done');

rollback;
