-- =============================================================
-- 로그인할 수 없는 회원의 운영자 탈퇴 처리 (#293)
--
--  무엇이 문제였나
--    카카오계정을 탈퇴했거나 연결을 끊어 로그인할 수 없는 회원은 서비스 안의
--    회원탈퇴 기능을 쓸 수 없다. 고객문의 채널로 탈퇴를 요청해도 운영자가 처리할
--    경로가 없어 개발 담당이 DB 에서 직접 처리해야 했다.
--
--  바꾼 방식
--    ① admin_find_member_for_withdrawal — 이메일·휴대전화번호·회원 UUID 정확 일치로만
--       대상 회원(USER·PARTNER)을 찾는다. 부분·이름 검색은 열지 않는다(최소 열람).
--       조회마다 접속기록을 남기되 검색어 원문(이메일·전화번호)은 기록하지 않는다.
--    ② admin_withdraw_member — 기존 withdraw_member(uuid, text) 를 그대로 호출한다.
--       거절 조건(미납·진행 예약·진행 서비스·미지급 정산)은 withdraw_member 가
--       원자적으로 재검증하고, 거절되면 트랜잭션 전체가 롤백된다.
--       소셜 연결 해제(마이그레이션 109 트리거)도 같은 트랜잭션에서 처리된다.
--       카카오 연결 해제 건(social_unlink_events)에서 처리하면 그 행도 같은
--       트랜잭션에서 파기하고 SOCIAL_UNLINK_RESOLVE 접속기록을 남긴다.
--    withdraw_member 의 authenticated 실행 권한은 계속 회수된 상태로 둔다.
--    운영자 경로는 이 두 함수를 지나야만 열린다.
--
--  처리 기준 (2026-10-23 결정 A, #291 · #293)
--    고객문의 채널로 회원 본인의 탈퇴 의사를 확인한 경우에만 처리한다.
--    연락이 닿지 않으면 탈퇴 처리하지 않고 계정을 유지한다(화면 안내).
--
--  근거
--    개인정보처리방침 제4조 — 회원 식별 정보는 회원 탈퇴 후 3년 분리 보관(withdraw_member 가 처리)
--    개인정보처리방침 제11조 ① — 처리 목적이 달성된 개인정보는 지체 없이 파기
--    개인정보처리방침 제11조 ③ — 보관이 필요한 정보는 분리하거나 접근을 제한하여 보관
--    개인정보처리방침 제12조 ③ — 회원탈퇴는 서비스 내 기능 또는 고객문의 채널로 요청
--    개인정보처리방침 제13조 — 접근권한 관리·접근통제 조치의 일환으로 활성 관리자 + MFA + 접속기록을 적용(범위 해석이며 방침 원문이 "모든 활성 관리자"를 명시하는 것은 아님)
-- =============================================================

-- ---------- ① 탈퇴 대상 조회 ----------
create or replace function public.admin_find_member_for_withdrawal(p_query text)
returns table (
  id           uuid,
  role         text,
  name         text,
  email        text,
  phone        text,
  status       text,
  withdrawn_at timestamptz,
  blocker_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_q      text;
  v_digits text;
  v_kind   text;
  v_ids    uuid[];
  v_id     uuid;
begin
  if not public.is_admin_live() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_q := btrim(coalesce(p_query, ''));
  v_digits := regexp_replace(v_q, '[^0-9]', '', 'g');

  -- 정확 일치 형식만 허용한다(최소 열람). 부분·이름 검색은 열지 않는다.
  if v_q ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_kind := 'uuid';
  elsif position('@' in v_q) > 1
        and char_length(v_q) <= 200
        and v_q ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    v_kind := 'email';
  elsif v_q ~ '^[0-9 ()+-]+$' and v_digits ~ '^[0-9]{9,11}$' then
    v_kind := 'phone';
  else
    raise exception 'invalid_query' using errcode = '22023';
  end if;

  select coalesce(array_agg(s.pid order by s.pid), '{}'::uuid[]) into v_ids
    from (
      select p.id as pid
        from public.profiles p
       where p.role in ('USER'::public.user_role, 'PARTNER'::public.user_role)
         and case v_kind
               when 'uuid'  then p.id = v_q::uuid
               when 'email' then lower(p.email) = lower(v_q)
               else regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') = v_digits
             end
       order by p.id
       limit 5
    ) s;

  -- 검색어 원문(이메일·전화번호)은 남기지 않는다. 검색 종류만 기록한다.
  -- 열람한 회원마다 한 건씩 남긴다(제13조 — 최대 5건 반환). 결과가 없으면 대상 없이 한 건.
  if coalesce(array_length(v_ids, 1), 0) = 0 then
    perform public.log_access(
      'MEMBER_WITHDRAWAL_LOOKUP', 'profiles', null, null,
      '운영자 탈퇴 대상 조회 (' || v_kind || ')'
    );
  else
    foreach v_id in array v_ids loop
      perform public.log_access(
        'MEMBER_WITHDRAWAL_LOOKUP', 'profiles', v_id, v_id,
        '운영자 탈퇴 대상 조회 (' || v_kind || ')'
      );
    end loop;
  end if;

  -- 차단 사유는 사전 안내용이다. 실제 차단은 withdraw_member 가 원자적으로 재검증한다.
  return query
  select p.id, p.role::text, p.name, p.email, p.phone, p.status::text, p.withdrawn_at,
         case
           when p.status = 'WITHDRAWN'::public.account_status then null
           when public.has_unpaid_charge(p.id) then 'UNPAID_CHARGE'
           when exists (
             select 1 from public.reservations r
              where r.customer_id = p.id
                and r.status in ('MATCHING'::public.reservation_status,
                                 'CONFIRMED'::public.reservation_status)
           ) then 'ACTIVE_RESERVATION'
           when exists (
             select 1 from public.services sv
              where sv.partner_id = p.id
                and sv.status in ('SCHEDULED'::public.service_status,
                                  'IN_PROGRESS'::public.service_status)
           ) then 'ACTIVE_SERVICE'
           when exists (
             select 1 from public.settlements st
              where st.partner_id = p.id
                and st.status = 'PENDING'::public.settlement_status
              group by st.partner_id
             having sum(st.net) > 0
           ) then 'PENDING_SETTLEMENT'
           else null
         end
    from public.profiles p
   where p.id = any (v_ids)
   order by p.id;
end;
$$;

comment on function public.admin_find_member_for_withdrawal(text) is
  '운영자 탈퇴 대상 조회(#293). 이메일·휴대전화번호·회원 UUID 정확 일치만, USER·PARTNER 최대 5건. 모든 활성 관리자(2단계 인증 완료, 담당 구분 없음, is_admin_live)만 가능하며 검색 종류만 접속기록에 남긴다(검색어 원문 미기록).';

revoke all on function public.admin_find_member_for_withdrawal(text) from public, anon;
grant execute on function public.admin_find_member_for_withdrawal(text) to authenticated;

-- ---------- ② 운영자 탈퇴 처리 ----------
create or replace function public.admin_withdraw_member(
  p_user_id          uuid,
  p_reason           text,
  p_social_unlink_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason  text;
  v_profile public.profiles%rowtype;
  v_unlink  record;
begin
  -- 쓰기는 JWT 가 아니라 현재 권한으로 재확인한다(제13조).
  if not public.is_admin_live() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) not between 5 and 500 then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;

  if p_user_id is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'ADMIN_NOT_ALLOWED' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 7));

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_profile.role = 'ADMIN'::public.user_role then
    raise exception 'ADMIN_NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_profile.status = 'WITHDRAWN'::public.account_status then
    raise exception 'ALREADY_WITHDRAWN' using errcode = 'P0001';
  end if;

  if p_social_unlink_id is not null then
    select e.id, e.user_id into v_unlink
      from public.social_unlink_events e
     where e.id = p_social_unlink_id
       for update;
    if not found then
      raise exception 'SOCIAL_UNLINK_NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_unlink.user_id is distinct from p_user_id then
      raise exception 'SOCIAL_UNLINK_USER_MISMATCH' using errcode = '22023';
    end if;
  end if;

  -- 기존 탈퇴 함수를 그대로 쓴다. 거절 조건이면 예외가 전파돼 전체가 롤백된다.
  -- 분리 보관 사유는 200자로 자른다(withdrawn_members.reason, 본인 탈퇴와 같은 길이).
  perform public.withdraw_member(p_user_id, left(v_reason, 200));

  perform public.log_access('ADMIN_MEMBER_WITHDRAW', 'profiles', p_user_id, p_user_id, v_reason);

  -- 연결 해제 건은 처리 목적이 달성됐으므로 같은 트랜잭션에서 파기한다(제11조 ①).
  if p_social_unlink_id is not null then
    delete from public.social_unlink_events where id = p_social_unlink_id;
    perform public.log_access(
      'SOCIAL_UNLINK_RESOLVE', 'social_unlink_events', p_social_unlink_id, p_user_id, v_reason
    );
  end if;

  return jsonb_build_object(
    'profile_id', p_user_id,
    'social_unlink_resolved', p_social_unlink_id is not null
  );
end;
$$;

comment on function public.admin_withdraw_member(uuid, text, uuid) is
  '운영자 회원 탈퇴(#293). 고객문의 채널로 본인 탈퇴 의사를 확인한 USER·PARTNER 만. withdraw_member 를 그대로 호출하고 접속기록을 남기며, 연결 해제 건이 주어지면 같은 트랜잭션에서 파기한다. 모든 활성 관리자(2단계 인증 완료, 담당 구분 없음, is_admin_live)만 가능.';

revoke all on function public.admin_withdraw_member(uuid, text, uuid) from public, anon;
grant execute on function public.admin_withdraw_member(uuid, text, uuid) to authenticated;

-- ---------- ③ 탈퇴 후 auth 잠금 재시도 · 결과 기록 ----------
--  DB 탈퇴가 커밋된 뒤 auth 잠금(이메일 .invalid 치환·밴)이 실패하면 admin_withdraw_member 는
--  ALREADY_WITHDRAWN 으로 거절하므로 화면에서 다시 걸 수 없었다. 서버 액션이 service_role 로
--  잠금을 걸기 전에 admin_prepare_auth_lock_retry 로 권한·대상을 확인하고,
--  잠금 결과(성공·실패)를 admin_record_auth_lock 으로 접속기록에 남긴다.
create or replace function public.admin_prepare_auth_lock_retry(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if not public.is_admin_live() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select * into v_profile from public.profiles where id = p_user_id;
  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_profile.role not in ('USER'::public.user_role, 'PARTNER'::public.user_role) then
    raise exception 'ADMIN_NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_profile.status <> 'WITHDRAWN'::public.account_status then
    raise exception 'NOT_WITHDRAWN' using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.admin_prepare_auth_lock_retry(uuid) is
  '탈퇴 완료된 USER·PARTNER 의 auth 잠금 재시도 사전 확인(#293). 활성 관리자(is_admin_live)만, 탈퇴 상태가 아니면 NOT_WITHDRAWN.';

revoke all on function public.admin_prepare_auth_lock_retry(uuid) from public, anon;
grant execute on function public.admin_prepare_auth_lock_retry(uuid) to authenticated;

create or replace function public.admin_record_auth_lock(
  p_user_id uuid,
  p_ok      boolean,
  p_retry   boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_prepare_auth_lock_retry(p_user_id);

  perform public.log_access(
    case when coalesce(p_ok, false) then 'ADMIN_AUTH_LOCK_OK' else 'ADMIN_AUTH_LOCK_FAILED' end,
    'profiles', p_user_id, p_user_id,
    case when coalesce(p_retry, false) then '탈퇴 후 auth 잠금 재시도' else '운영자 탈퇴 직후 auth 잠금' end
  );
end;
$$;

comment on function public.admin_record_auth_lock(uuid, boolean, boolean) is
  '탈퇴 후 auth 잠금 결과 접속기록(#293). 실패 건(ADMIN_AUTH_LOCK_FAILED)을 나중에 찾아 재시도할 수 있게 한다.';

revoke all on function public.admin_record_auth_lock(uuid, boolean, boolean) from public, anon;
grant execute on function public.admin_record_auth_lock(uuid, boolean, boolean) to authenticated;
