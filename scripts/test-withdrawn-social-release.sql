-- 탈퇴 회원의 소셜 로그인 연결 해제 (#293) — 탈퇴와 같은 트랜잭션의 트리거·권한·탈퇴 회원만·이메일 연결 유지·제공자 프로필 비움.
begin;
create function pg_temp.assert(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'FAIL: %', p_label; end if;
  raise notice 'PASS: %', p_label;
end;
$$;
create function pg_temp.denied(p_sql text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'PASS: % (%)', p_label, sqlerrm;
    return;
  end;
  raise exception 'FAIL: % — expected denied', p_label;
end;
$$;

insert into auth.users(id,email,raw_user_meta_data) values
  ('00000293-0000-4000-8000-000000000001','withdrawn+00000293-0000-4000-8000-000000000001@users.hamkegayo.invalid',
   '{"name":"카카오닉네임","avatar_url":"https://example.invalid/a.png"}'),
  ('00000293-0000-4000-8000-000000000002','relink-active@example.invalid',
   '{"name":"활성회원"}');
insert into public.profiles(id,name,role,status,withdrawn_at) values
  ('00000293-0000-4000-8000-000000000001','탈퇴','USER','WITHDRAWN',now()),
  ('00000293-0000-4000-8000-000000000002','활성','USER','ACTIVE',null);
insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at) values
  ('2930000001','00000293-0000-4000-8000-000000000001','{"sub":"2930000001"}','kakao',now(),now()),
  ('naver-293-1','00000293-0000-4000-8000-000000000001','{"sub":"naver-293-1"}','custom:naver',now(),now()),
  ('00000293-0000-4000-8000-000000000001','00000293-0000-4000-8000-000000000001',
   '{"sub":"00000293-0000-4000-8000-000000000001"}','email',now(),now()),
  ('2930000002','00000293-0000-4000-8000-000000000002','{"sub":"2930000002"}','kakao',now(),now());

-- 클라이언트는 실행할 수 없다
select pg_temp.assert(
  not has_function_privilege('anon','public.release_withdrawn_social_identities(uuid)','execute')
  and not has_function_privilege('authenticated','public.release_withdrawn_social_identities(uuid)','execute')
  and has_function_privilege('service_role','public.release_withdrawn_social_identities(uuid)','execute'),
  'release is service_role only');

set local role service_role;
-- 탈퇴하지 않은 회원의 로그인 수단은 지우지 않는다
select pg_temp.denied($q$select public.release_withdrawn_social_identities('00000293-0000-4000-8000-000000000002')$q$,
  'active member rejected');
select pg_temp.denied($q$select public.release_withdrawn_social_identities(gen_random_uuid())$q$,
  'unknown user rejected');
-- 탈퇴 회원: 카카오·네이버 연결 2건을 지운다
select pg_temp.assert(
  public.release_withdrawn_social_identities('00000293-0000-4000-8000-000000000001') = 2,
  'withdrawn member social identities released');
select pg_temp.assert(
  public.release_withdrawn_social_identities('00000293-0000-4000-8000-000000000001') = 0,
  'second call is a no-op');
reset role;

select pg_temp.assert(
  not exists(select 1 from auth.identities
              where user_id='00000293-0000-4000-8000-000000000001' and provider <> 'email'),
  'no social identity left on withdrawn account');
select pg_temp.assert(
  exists(select 1 from auth.identities
          where user_id='00000293-0000-4000-8000-000000000001' and provider = 'email'),
  'email identity kept');
select pg_temp.assert(
  (select raw_user_meta_data from auth.users where id='00000293-0000-4000-8000-000000000001') = '{}'::jsonb,
  'provider profile metadata cleared');
-- 같은 카카오 회원번호로 다시 로그인하면 연결된 계정이 없어 새 계정으로 가입된다
select pg_temp.assert(
  not exists(select 1 from auth.identities where provider='kakao' and provider_id='2930000001'),
  'same kakao id is free for a new account');
-- 다른 회원은 그대로
select pg_temp.assert(
  exists(select 1 from auth.identities where provider='kakao' and provider_id='2930000002')
  and (select raw_user_meta_data ->> 'name' from auth.users where id='00000293-0000-4000-8000-000000000002') = '활성회원',
  'active member untouched');

-- 트리거: 탈퇴(withdraw_member) 트랜잭션 안에서 함께 해제된다 (#295 리뷰)
insert into auth.users(id,email,raw_user_meta_data) values
  ('00000293-0000-4000-8000-000000000003','relink-withdraw@example.invalid','{"name":"탈퇴예정"}');
insert into public.profiles(id,name,role,email,phone) values
  ('00000293-0000-4000-8000-000000000003','탈퇴예정','USER','relink-withdraw@example.invalid','01000002930');
insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at) values
  ('2930000003','00000293-0000-4000-8000-000000000003','{"sub":"2930000003"}','kakao',now(),now()),
  ('naver-293-3','00000293-0000-4000-8000-000000000003','{"sub":"naver-293-3"}','custom:naver',now(),now()),
  ('00000293-0000-4000-8000-000000000003','00000293-0000-4000-8000-000000000003',
   '{"sub":"00000293-0000-4000-8000-000000000003"}','email',now(),now());

-- 탈퇴가 아닌 상태 변경은 트리거를 타지 않는다
update public.profiles set status='SUSPENDED' where id='00000293-0000-4000-8000-000000000003';
select pg_temp.assert(
  (select count(*) from auth.identities where user_id='00000293-0000-4000-8000-000000000003') = 3,
  'non-withdrawal status change keeps identities');
update public.profiles set status='ACTIVE' where id='00000293-0000-4000-8000-000000000003';

-- 탈퇴가 실패해 롤백되면 해제도 함께 롤백된다
do $$
begin
  begin
    update public.profiles set status='WITHDRAWN', withdrawn_at=now()
     where id='00000293-0000-4000-8000-000000000003';
    raise exception 'simulated withdrawal failure';
  exception when others then
    null;
  end;
end;
$$;
select pg_temp.assert(
  (select count(*) from auth.identities where user_id='00000293-0000-4000-8000-000000000003') = 3,
  'failed withdrawal rolls back the release');

-- 실제 탈퇴 함수로 탈퇴하면 같은 트랜잭션에서 소셜 연결만 사라진다
set local role service_role;
select public.withdraw_member('00000293-0000-4000-8000-000000000003', null);
reset role;
select pg_temp.assert(
  (select status::text from public.profiles where id='00000293-0000-4000-8000-000000000003') = 'WITHDRAWN',
  'withdraw_member succeeded');
select pg_temp.assert(
  not exists(select 1 from auth.identities
              where user_id='00000293-0000-4000-8000-000000000003' and provider <> 'email')
  and exists(select 1 from auth.identities
              where user_id='00000293-0000-4000-8000-000000000003' and provider = 'email'),
  'withdrawal releases social identities and keeps email identity');
select pg_temp.assert(
  (select raw_user_meta_data from auth.users where id='00000293-0000-4000-8000-000000000003') = '{}'::jsonb,
  'withdrawal clears provider profile metadata');

rollback;
