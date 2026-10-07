-- 고객 보호자 리포트 열람 (#253) — 소유자만, 제출분만, 본문·첨부는 동의 시만(본인 관계로 대체 불가), 파기 표시, 접근 기록.
begin;
create function pg_temp.assert(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'FAIL: %', p_label; end if;
  raise notice 'PASS: %', p_label;
end;
$$;

select pg_temp.assert(not has_function_privilege('anon','public.get_own_report(uuid)','execute'), 'anon cannot call');

insert into auth.users(id,email) values
  ('00000253-0000-4000-8000-000000000001','report-owner@example.invalid'),
  ('00000253-0000-4000-8000-000000000002','report-other@example.invalid'),
  ('00000253-0000-4000-8000-000000000003','report-partner@example.invalid');
insert into public.profiles(id,name,role) values
  ('00000253-0000-4000-8000-000000000001','Report Owner','USER'),
  ('00000253-0000-4000-8000-000000000002','Report Other','USER'),
  ('00000253-0000-4000-8000-000000000003','Report Partner','PARTNER');

-- 예약 + 서비스 + 리포트 fixture
create function pg_temp.fixture(p_n int, p_relation text, p_share boolean,
                                p_status public.report_status default 'SUBMITTED',
                                p_purged boolean default false)
returns uuid language plpgsql as $$
declare
  v_res uuid := ('00000253-0000-4000-8000-0000000001' || lpad(p_n::text, 2, '0'))::uuid;
  v_svc uuid := gen_random_uuid();
  v_rep uuid := gen_random_uuid();
begin
  insert into public.reservations(id, code, customer_id, status, plan, use_date, arrive_time, reserve_time,
                                  duration, duration_minutes, hospital_address, confirmed_partner_id,
                                  relation, share_medical_info)
  values (v_res, 'TEST-RPT-'||p_n, '00000253-0000-4000-8000-000000000001', 'COMPLETED', 'basic',
          '2099-01-01', '09:00', '09:30', '2시간', 120, 'Test', '00000253-0000-4000-8000-000000000003',
          p_relation, p_share);
  insert into public.services(id, reservation_id, partner_id, status, started_at, ended_at)
  values (v_svc, v_res, '00000253-0000-4000-8000-000000000003', 'COMPLETED', now() - interval '3 hours', now() - interval '1 hour');
  insert into public.reports(id, service_id, partner_id, status, supports, exam, guardian_note, submitted_at,
                             sensitive_data_purged_at)
  values (v_rep, v_svc, '00000253-0000-4000-8000-000000000003', p_status, array['접수 대행','수납 지원'],
          '혈액검사 진행', '다음 진료는 2주 뒤', case when p_status = 'SUBMITTED' then now() end,
          case when p_purged then now() end);
  insert into public.report_attachments(report_id, kind, path, filename, size)
  values (v_rep, '첨부', '00000253-0000-4000-8000-000000000003/'||v_rep||'/rx.pdf', 'rx.pdf', 2048);
  return v_res;
end;
$$;

select pg_temp.fixture(1, '자녀', false);               -- 동의 없음
select pg_temp.fixture(2, '자녀', true);                -- 동의
select pg_temp.fixture(3, '본인', false);               -- 관계 '본인' + 동의 없음 (동의 대체 불가)
select pg_temp.fixture(4, '자녀', true, 'DRAFT');       -- 작성 중
select pg_temp.fixture(5, '자녀', true, 'SUBMITTED', true);  -- 파기

create temp table t_out(k text, v jsonb);
grant all on t_out to authenticated;

-- 다른 고객·파트너는 볼 수 없다
select set_config('request.jwt.claims','{"sub":"00000253-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
insert into t_out select 'other', public.get_own_report('00000253-0000-4000-8000-000000000102');
select pg_temp.assert(not exists(select 1 from public.reports), 'other customer cannot read reports table');
reset role;
select set_config('request.jwt.claims','{"sub":"00000253-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
insert into t_out select 'partner', public.get_own_report('00000253-0000-4000-8000-000000000102');
reset role;

-- 소유자
select set_config('request.jwt.claims','{"sub":"00000253-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
insert into t_out select 'noconsent', public.get_own_report('00000253-0000-4000-8000-000000000101');
insert into t_out select 'consent',   public.get_own_report('00000253-0000-4000-8000-000000000102');
insert into t_out select 'self',      public.get_own_report('00000253-0000-4000-8000-000000000103');
insert into t_out select 'draft',     public.get_own_report('00000253-0000-4000-8000-000000000104');
insert into t_out select 'purged',    public.get_own_report('00000253-0000-4000-8000-000000000105');
insert into t_out select 'missing',   public.get_own_report(gen_random_uuid());
reset role;

select pg_temp.assert((select v from t_out where k='other') is null, 'other customer gets nothing');
select pg_temp.assert((select v from t_out where k='partner') is null, 'partner gets nothing via customer RPC');
select pg_temp.assert((select v from t_out where k='draft') is null, 'draft report not visible');
select pg_temp.assert((select v from t_out where k='missing') is null, 'unknown reservation returns null');

select pg_temp.assert((select v->'guardian_note' from t_out where k='noconsent') = 'null'::jsonb
                      and (select jsonb_array_length(v->'supports') from t_out where k='noconsent') = 0
                      and (select v->'exam' from t_out where k='noconsent') = 'null'::jsonb
                      and (select jsonb_array_length(v->'attachments') from t_out where k='noconsent') = 0
                      and (select (v->>'medical_shared')::boolean from t_out where k='noconsent') = false,
                      'no consent: no body at all (supports, guardian note, exam, attachments)');

select pg_temp.assert((select v->>'exam' from t_out where k='consent') = '혈액검사 진행'
                      and (select v->>'guardian_note' from t_out where k='consent') = '다음 진료는 2주 뒤'
                      and (select jsonb_array_length(v->'supports') from t_out where k='consent') = 2
                      and (select jsonb_array_length(v->'attachments') from t_out where k='consent') = 1,
                      'consent: full body and attachments returned');
select pg_temp.assert((select v->'exam' from t_out where k='self') = 'null'::jsonb
                      and (select v->'guardian_note' from t_out where k='self') = 'null'::jsonb
                      and (select jsonb_array_length(v->'attachments') from t_out where k='self') = 0
                      and (select (v->>'medical_shared')::boolean from t_out where k='self') = false,
                      'relation self without consent: nothing returned (no bypass)');

select pg_temp.assert((select (v->>'purged')::boolean from t_out where k='purged')
                      and (select v->'exam' from t_out where k='purged') = 'null'::jsonb
                      and (select v->'guardian_note' from t_out where k='purged') = 'null'::jsonb
                      and (select jsonb_array_length(v->'attachments') from t_out where k='purged') = 0,
                      'purged: flag only, no content');

select pg_temp.assert((select count(*) from public.access_logs
                        where actor_id='00000253-0000-4000-8000-000000000001'
                          and action='REPORT_VIEW_CUSTOMER') = 4, 'each owner view logged (4 visible reports)');
select pg_temp.assert(not exists(select 1 from public.access_logs
                        where actor_id in ('00000253-0000-4000-8000-000000000002','00000253-0000-4000-8000-000000000003')
                          and action='REPORT_VIEW_CUSTOMER'), 'denied calls not logged as views');

rollback;
