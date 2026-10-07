-- 결제 포인트 적립 (#249) — 정산이 끝난 예약에 1% 를 한 번만 적립한다.
begin;
create function pg_temp.assert(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'FAIL: %', p_label; end if;
  raise notice 'PASS: %', p_label;
end;
$$;

-- 권한: 서버 전용
select pg_temp.assert(
  not has_function_privilege('authenticated','public.earn_reservation_points(uuid)','execute')
  and not has_function_privilege('anon','public.earn_reservation_points(uuid)','execute')
  and not has_function_privilege('authenticated','public.sweep_earn_points(integer)','execute')
  and not has_function_privilege('anon','public.sweep_earn_points(integer)','execute'),
  'earn/sweep not executable by clients');
select pg_temp.assert(has_function_privilege('service_role','public.earn_reservation_points(uuid)','execute'), 'server can earn');
select pg_temp.assert(exists(select 1 from cron.job where jobname='point-earn-sweep'), 'sweep cron scheduled');

-- 고객·파트너
insert into auth.users(id,email) values
  ('00000249-0000-4000-8000-000000000001','earn-user@example.invalid'),
  ('00000249-0000-4000-8000-000000000002','earn-partner@example.invalid');
insert into public.profiles(id,name,role) values
  ('00000249-0000-4000-8000-000000000001','Earn User','USER'),
  ('00000249-0000-4000-8000-000000000002','Earn Partner','PARTNER');

-- 예약 fixture: code 접미사 / 상태 / 노쇼 / 종료 시각
create function pg_temp.fixture(p_suffix text, p_status public.reservation_status, p_no_show boolean default false,
                                p_ended timestamptz default now(), p_final integer default 40000)
returns uuid language plpgsql as $$
declare v_res uuid := gen_random_uuid();
begin
  insert into public.reservations(id, code, customer_id, status, plan, use_date, arrive_time, reserve_time,
                                  duration, duration_minutes, hospital_address, confirmed_partner_id, final_amount)
  values (v_res, 'TEST-EARN-'||p_suffix, '00000249-0000-4000-8000-000000000001', p_status, 'basic',
          '2099-01-01', '09:00', '09:30', '2시간', 120, 'Test', '00000249-0000-4000-8000-000000000002', p_final);
  insert into public.services(reservation_id, partner_id, status, started_at, ended_at, no_show)
  values (v_res, '00000249-0000-4000-8000-000000000002', 'COMPLETED', p_ended - interval '2 hours', p_ended, p_no_show);
  return v_res;
end;
$$;

create function pg_temp.pay(p_res uuid, p_type public.payment_type, p_status public.payment_status,
                            p_gross integer, p_discount integer default 0)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.payments(reservation_id, type, status, order_id, gross_amount, discount_amount,
                              commission_amount, payout_amount, paid_at)
  values (p_res, p_type, p_status, 'TEST-EARN-'||gen_random_uuid()::text, p_gross, p_discount, 0,
          p_gross - p_discount, case when p_status='PAID' then now() end)
  returning id into v_id;
  return v_id;
end;
$$;

-- A. 정상 완료: 선결제 40,000 중 포인트 3,000 사용 → 현금 37,000 → 370P
do $$
declare v_res uuid := pg_temp.fixture('A', 'COMPLETED');
begin
  perform pg_temp.pay(v_res, 'BASE', 'PAID', 40000, 3000);
  perform pg_temp.assert(public.earn_reservation_points(v_res) = 370, 'A: 1% of cash excluding points used');
  perform pg_temp.assert(public.earn_reservation_points(v_res) = 0, 'A: second call earns nothing');
  perform pg_temp.assert((select count(*) from public.points where reservation_id=v_res and reason='EARN_PAYMENT') = 1, 'A: single earn row');
  perform pg_temp.assert((select expires_at is null from public.points where reservation_id=v_res and reason='EARN_PAYMENT'), 'A: no expiry');
  perform pg_temp.assert(exists(select 1 from public.notifications where dedupe_key='point-earn:'||v_res::text and type='POINT_EARNED'), 'A: customer notified');
end;
$$;
select pg_temp.assert(public.point_balance('00000249-0000-4000-8000-000000000001') = 370, 'balance reflects earned points');

-- B. 추가결제 대기 중이면 기다리고, 결제되면 합산해 적립
do $$
declare v_res uuid := pg_temp.fixture('B', 'COMPLETED'); v_ext uuid;
begin
  perform pg_temp.pay(v_res, 'BASE', 'PAID', 40000);
  v_ext := pg_temp.pay(v_res, 'EXTENSION', 'PENDING', 10000);
  perform pg_temp.assert(public.earn_reservation_points(v_res) = 0, 'B: pending extension blocks earning');
  update public.payments set status='PAID', paid_at=now() where id=v_ext;
  perform pg_temp.assert(public.earn_reservation_points(v_res) = 500, 'B: base + extension cash');
end;
$$;

-- C. 미달분 환불 진행 중이면 기다리고, 환불이 끝나면 차감해 적립
do $$
declare v_res uuid := pg_temp.fixture('C', 'COMPLETED'); v_base uuid; v_req uuid;
begin
  v_base := pg_temp.pay(v_res, 'BASE', 'PAID', 40000);
  insert into public.refund_requests(reservation_id, payment_id, amount, status)
  values (v_res, v_base, 15000, 'PENDING') returning id into v_req;
  perform pg_temp.assert(public.earn_reservation_points(v_res) = 0, 'C: pending refund blocks earning');
  update public.refund_requests set status='APPROVED' where id=v_req;
  perform pg_temp.assert(public.earn_reservation_points(v_res) = 0, 'C: refund in execution blocks earning');
  insert into public.payments(reservation_id, type, status, order_id, gross_amount, discount_amount,
                              commission_amount, payout_amount, paid_at)
  values (v_res, 'REFUND', 'PAID', 'TEST-EARN-C-S', -15000, 0, 0, -15000, now());
  update public.refund_requests set status='COMPLETED', completed_at=now() where id=v_req;
  perform pg_temp.assert(public.earn_reservation_points(v_res) = 250, 'C: refund deducted from cash');
end;
$$;

-- D. 1원 미만 버림
do $$
declare v_res uuid := pg_temp.fixture('D', 'COMPLETED');
begin
  perform pg_temp.pay(v_res, 'BASE', 'PAID', 40050);
  perform pg_temp.assert(public.earn_reservation_points(v_res) = 400, 'D: floor below 1 won');
end;
$$;

-- E. 적립하지 않는 경우
do $$
declare v_res uuid;
begin
  v_res := pg_temp.fixture('E1', 'COMPLETED', p_no_show => true);
  perform pg_temp.pay(v_res, 'BASE', 'PAID', 40000);
  perform pg_temp.assert(public.earn_reservation_points(v_res) = 0, 'E1: no-show not earned');

  v_res := pg_temp.fixture('E2', 'CANCELLED');
  perform pg_temp.pay(v_res, 'BASE', 'PAID', 40000);
  perform pg_temp.assert(public.earn_reservation_points(v_res) = 0, 'E2: cancelled not earned');

  v_res := pg_temp.fixture('E3', 'COMPLETED',
    p_ended => (select started_at from public.point_earn_policy where id) - interval '1 day');
  perform pg_temp.pay(v_res, 'BASE', 'PAID', 40000);
  perform pg_temp.assert(public.earn_reservation_points(v_res) = 0, 'E3: ended before policy start, no backfill');

  v_res := pg_temp.fixture('E4', 'COMPLETED', p_final => null);
  perform pg_temp.pay(v_res, 'BASE', 'PAID', 40000);
  perform pg_temp.assert(public.earn_reservation_points(v_res) = 0, 'E4: final amount not settled');

  v_res := pg_temp.fixture('E5', 'COMPLETED');
  perform pg_temp.pay(v_res, 'BASE', 'PAID', 40000, 40000);
  perform pg_temp.assert(public.earn_reservation_points(v_res) = 0, 'E5: no cash paid, nothing earned');
end;
$$;

-- F. 주기 정리가 남은 건을 적립한다
do $$
declare v_res uuid := pg_temp.fixture('F', 'COMPLETED');
begin
  perform pg_temp.pay(v_res, 'BASE', 'PAID', 50000);
  perform public.sweep_earn_points();
  perform pg_temp.assert((select amount from public.points where reservation_id=v_res and reason='EARN_PAYMENT') = 500, 'F: sweep earns settled reservation');
  perform public.sweep_earn_points();
  perform pg_temp.assert((select count(*) from public.points where reservation_id=v_res and reason='EARN_PAYMENT') = 1, 'F: repeated sweep does not duplicate');
end;
$$;

-- H. 미결·적립액 0 예약이 배치 앞자리를 막지 않는다 (PR #258 리뷰)
--    오래된 순으로 처리하므로, 거르지 않으면 1건 한도에서 H3·H2 가 먼저 잡힌다.
do $$
declare
  v_start timestamptz := (select started_at from public.point_earn_policy where id);
  v_h1 uuid; v_h2 uuid; v_h3 uuid;
begin
  v_h3 := pg_temp.fixture('H3', 'COMPLETED', p_ended => v_start + interval '1 millisecond');
  perform pg_temp.pay(v_h3, 'BASE', 'PAID', 40000, 40000);            -- 현금 0 → 영영 적립 없음
  v_h2 := pg_temp.fixture('H2', 'COMPLETED', p_ended => v_start + interval '2 milliseconds');
  perform pg_temp.pay(v_h2, 'BASE', 'PAID', 40000);
  perform pg_temp.pay(v_h2, 'EXTENSION', 'PENDING', 10000);          -- 추가결제 대기
  v_h1 := pg_temp.fixture('H1', 'COMPLETED', p_ended => v_start + interval '3 milliseconds');
  perform pg_temp.pay(v_h1, 'BASE', 'PAID', 30000);

  perform pg_temp.assert(public.sweep_earn_points(1) = 1, 'H: limit 1 still earns one');
  perform pg_temp.assert((select amount from public.points where reservation_id=v_h1 and reason='EARN_PAYMENT') = 300, 'H: settled older reservation not starved by pending/zero-cash');
  perform pg_temp.assert(not exists(select 1 from public.points where reservation_id in (v_h2, v_h3) and reason='EARN_PAYMENT'), 'H: pending and zero-cash still not earned');
end;
$$;

-- G. 고객이 직접 적립 행을 쓸 수 없다
select set_config('request.jwt.claims','{"sub":"00000249-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
begin
  begin
    insert into public.points(user_id, amount, reason) values ('00000249-0000-4000-8000-000000000001', 1000, 'EARN_PAYMENT');
  exception when insufficient_privilege then
    raise notice 'PASS: G: client cannot insert points';
    return;
  end;
  raise exception 'FAIL: G: client inserted points';
end;
$$;
reset role;

rollback;
