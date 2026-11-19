// 선결제 후 운영자 직접 배정 (#300) — 동시성 검증.
//   배정 ↔ 고객 취소 경쟁, 같은 파트너 중복 배정, 결제 재콜백 경쟁, 접수 알림 임대 경쟁에서
//   이중 확정·이중 접수·이중 발송이 없고 상태와 원장이 한쪽으로만 정리되는지 본다.
//
//  서로 다른 DB 세션이 필요해서 SQL 파일 대신 psql 세션을 동시에 띄운다. 한 세션이 행 잠금을 쥔 채
//  잠시 쉬는 동안 다른 세션이 들어온다. 어느 쪽이 먼저 잠금을 잡든 결과가 일관되는지를 단언한다
//  (순서에 의존하지 않는다 — docker exec 기동 시간이 일정하지 않다).
//
//  실제 행을 만들고 지운다. 로컬 스택 전용이다(컨테이너 이름은 supabase/config.toml 의 project_id).

import { spawn, spawnSync } from "node:child_process";

const CONTAINER = "supabase_db_my-app";
const DB_URL =
    process.env.SUPABASE_DB_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function hasCommand(cmd) {
    return spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0;
}

const USE_HOST_PSQL = hasCommand("psql");

/** SQL 한 덩어리를 새 세션으로 실행한다. 종료 코드와 출력을 돌려준다. */
function psql(sql) {
    return new Promise((resolve) => {
        const [cmd, args] = USE_HOST_PSQL
            ? ["psql", [DB_URL, "-v", "ON_ERROR_STOP=1", "-q", "-At"]]
            : [
                  "docker",
                  [
                      "exec",
                      "-i",
                      CONTAINER,
                      "psql",
                      "-U",
                      "postgres",
                      "-v",
                      "ON_ERROR_STOP=1",
                      "-q",
                      "-At",
                  ],
              ];
        const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
        let out = "";
        let err = "";
        child.stdout.on("data", (d) => (out += d));
        child.stderr.on("data", (d) => (err += d));
        child.on("close", (code) => resolve({ code, out, err }));
        child.stdin.end(sql);
    });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(ok, label) {
    if (ok) console.log(`PASS: ${label}`);
    else {
        failures += 1;
        console.error(`FAIL: ${label}`);
    }
}

const id = (kind, n) =>
    `00000301-${kind}-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = id("0000", 1);
const CUST = id("0000", 2);
const P1 = id("0000", 11);
const P2 = id("0000", 12);
const res = (n) => id("0001", n);
const pay = (n) => id("0002", n);

const jwt = (sub, role) =>
    `select set_config('request.jwt.claims','{"sub":"${sub}","role":"authenticated","aal":"aal2","app_metadata":{"role":"${role}"}}',true);`;
/** 한 세션이 행 잠금을 쥔 채 holdSeconds 동안 쉬는 트랜잭션 */
const session = (sub, role, call, holdSeconds = 0) => `
begin;
${jwt(sub, role)}
set local role authenticated;
${call};
reset role;
${holdSeconds ? `select pg_sleep(${holdSeconds});` : ""}
commit;`;

const assignSql = (r, partner) =>
    `select public.admin_assign_partner('${r}', '${partner}', 'PHONE', 'concurrency')`;

const FIXTURE = `
insert into auth.users(id, email) values
  ('${ADMIN}', 'cc-admin@example.invalid'), ('${CUST}', 'cc-cust@example.invalid'),
  ('${P1}', 'cc-p1@example.invalid'), ('${P2}', 'cc-p2@example.invalid');
insert into public.profiles(id, name, role, status) values
  ('${ADMIN}', 'CC Admin', 'ADMIN', 'ACTIVE'), ('${CUST}', 'CC Cust', 'USER', 'ACTIVE'),
  ('${P1}', 'CC P1', 'PARTNER', 'ACTIVE'), ('${P2}', 'CC P2', 'PARTNER', 'ACTIVE');
insert into public.admin_accounts(profile_id, duty) values ('${ADMIN}', '정산');
`;

/** 결제 완료(매칭 대기) 예약 한 건. 같은 날짜·시각이면 서로 일정이 겹친다. */
function reservationSql(n, { day, time = "10:00", paid = true } = {}) {
    return `
insert into public.reservations(id, code, customer_id, plan, patient_name, patient_birth, patient_gender, patient_phone,
  guardian_name, guardian_phone, relation, treatment, purpose, use_date, arrive_time, reserve_time, duration, duration_minutes,
  depart_address, hospital_address, matching_mode, prepaid_amount, fee_rate)
values ('${res(n)}', 'CC300-${n}', '${CUST}', 'basic', 'T', '1960-01-01', 'female', '01000000000', 'T', '01000000000', 'self',
  'T', 'T', ((now() at time zone 'Asia/Seoul')::date + ${day}), '${time}', '${time}', '2시간', 120, 'T', 'T', 'admin_direct', 40000, 0.2);
insert into public.payments(id, reservation_id, type, status, order_id, gross_amount, discount_amount, commission_amount, payout_amount, commission_rate, transaction_id)
values ('${pay(n)}', '${res(n)}', 'BASE', 'PENDING', 'CC300-ORDER-${n}', 40000, 0, 8000, 32000, 0.2, 'CC300-TID-${n}');
${paid ? `select public.finalize_payment('${pay(n)}', 'CC300-TID-${n}', now());` : ""}`;
}

const CLEANUP = `
delete from public.reservation_refunds where reservation_id::text like '00000301-%';
delete from public.reservation_intakes where reservation_id::text like '00000301-%';
delete from public.services where reservation_id::text like '00000301-%';
delete from public.payments where reservation_id::text like '00000301-%';
delete from public.reservations where id::text like '00000301-%';
delete from auth.users where id::text like '00000301-%';`;

const q = async (sql) => (await psql(sql)).out.trim();

try {
    await psql(CLEANUP); // 이전 실행이 중간에 죽었다면 정리부터
    const setup = await psql(FIXTURE);
    if (setup.code !== 0) throw new Error(`fixture failed: ${setup.err}`);

    // ---------- A. 배정이 먼저 잠금을 잡고 고객 취소가 뒤따른다 ----------
    await psql(reservationSql(1, { day: 5 }));
    {
        const assign = psql(
            session(ADMIN, "ADMIN", assignSql(res(1), P1), 2.5),
        );
        await sleep(400);
        const cancel = psql(
            session(
                CUST,
                "USER",
                `select public.customer_cancel_before_assignment('${res(1)}')`,
            ),
        );
        const [a, c] = await Promise.all([assign, cancel]);
        const status = await q(
            `select status from public.reservations where id='${res(1)}'`,
        );
        const refunds = await q(
            `select count(*) from public.reservation_refunds where reservation_id='${res(1)}'`,
        );
        const services = await q(
            `select count(*) from public.services where reservation_id='${res(1)}'`,
        );
        check(
            (a.code === 0) !== (c.code === 0),
            "A: exactly one of assign/cancel wins",
        );
        check(
            (status === "CONFIRMED" && refunds === "0" && services === "1") ||
                (status === "CANCELLED" && refunds === "1" && services === "0"),
            `A: final state is consistent (status=${status} refunds=${refunds} services=${services})`,
        );
    }

    // ---------- B. 취소가 먼저, 배정이 뒤따른다 ----------
    await psql(reservationSql(2, { day: 6 }));
    {
        const cancel = psql(
            session(
                CUST,
                "USER",
                `select public.customer_cancel_before_assignment('${res(2)}')`,
                2.5,
            ),
        );
        await sleep(400);
        const assign = psql(session(ADMIN, "ADMIN", assignSql(res(2), P1)));
        const [c, a] = await Promise.all([cancel, assign]);
        const status = await q(
            `select status from public.reservations where id='${res(2)}'`,
        );
        const refunds = await q(
            `select count(*) from public.reservation_refunds where reservation_id='${res(2)}'`,
        );
        const services = await q(
            `select count(*) from public.services where reservation_id='${res(2)}'`,
        );
        check(
            (a.code === 0) !== (c.code === 0),
            "B: exactly one of cancel/assign wins",
        );
        check(
            (status === "CONFIRMED" && refunds === "0" && services === "1") ||
                (status === "CANCELLED" && refunds === "1" && services === "0"),
            `B: final state is consistent (status=${status} refunds=${refunds} services=${services})`,
        );
    }

    // ---------- C. 같은 파트너에게 겹치는 두 예약을 동시에 배정 ----------
    await psql(reservationSql(3, { day: 7 }));
    await psql(reservationSql(4, { day: 7 })); // 같은 날짜·시각 → 일정 겹침
    {
        const s1 = psql(session(ADMIN, "ADMIN", assignSql(res(3), P2), 2.5));
        await sleep(400);
        const s2 = psql(session(ADMIN, "ADMIN", assignSql(res(4), P2)));
        const [r1, r2] = await Promise.all([s1, s2]);
        const confirmed = await q(
            `select count(*) from public.reservations where confirmed_partner_id='${P2}' and status='CONFIRMED' and id::text like '00000301-%'`,
        );
        check(
            (r1.code === 0) !== (r2.code === 0),
            "C: exactly one overlapping assignment wins",
        );
        check(
            confirmed === "1",
            `C: partner holds a single overlapping booking (count=${confirmed})`,
        );
    }

    // ---------- D. 같은 결제의 재콜백이 동시에 들어온다 ----------
    await psql(reservationSql(5, { day: 8, paid: false }));
    {
        const call = `select public.finalize_payment('${pay(5)}', 'CC300-TID-5', now())`;
        const s1 = psql(`begin; ${call}; select pg_sleep(1.5); commit;`);
        await sleep(300);
        const s2 = psql(`begin; ${call}; commit;`);
        const [r1, r2] = await Promise.all([s1, s2]);
        const intakes = await q(
            `select count(*) from public.reservation_intakes where reservation_id='${res(5)}'`,
        );
        const events = await q(
            `select count(*) from public.reservation_events where reservation_id='${res(5)}' and event_type='PAID'`,
        );
        const notices = await q(
            `select count(*) from public.notifications where dedupe_key='direct-received:${res(5)}'`,
        );
        check(
            r1.code === 0 && r2.code === 0,
            "D: both callbacks succeed idempotently",
        );
        check(
            intakes === "1" && events === "1" && notices === "1",
            `D: single intake/event/notification (${intakes}/${events}/${notices})`,
        );
    }

    // ---------- E. 접수 알림 임대 경쟁 — 같은 건이 두 번 집히지 않는다 ----------
    {
        await psql(
            `update public.reservation_intakes set notify_status='SENT' where reservation_id::text like '00000301-%' and reservation_id <> '${res(5)}'`,
        );
        const claim = `select count(*) from public.claim_intake_notifications(10)`;
        const s1 = psql(`begin; ${claim}; select pg_sleep(1.5); commit;`);
        await sleep(300);
        const s2 = psql(`begin; ${claim}; commit;`);
        const [r1, r2] = await Promise.all([s1, s2]);
        const total =
            Number(r1.out.trim().split("\n")[0] || 0) +
            Number(r2.out.trim().split("\n")[0] || 0);
        check(
            r1.code === 0 && r2.code === 0 && total === 1,
            `E: one intake is claimed exactly once (${total})`,
        );
    }
} catch (e) {
    failures += 1;
    console.error(e);
} finally {
    await psql(CLEANUP);
}

if (failures > 0) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
}
console.log("direct assignment concurrency: all checks passed");
