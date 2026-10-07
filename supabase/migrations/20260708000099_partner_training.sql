-- =============================================================
-- 파트너 교육 이수 확인 기록 + 미이수 시 요청 수락 차단 — #255-3
--
--  근거 : 파트너 현장업무 매뉴얼 10장 — 첫 업무 수락 전에 기본 업무교육·응급상황 대응교육·
--         개인정보 보호교육 이수를 확인한다. "교육 이수 여부가 확인되지 않으면 업무를 수락하지 않는다."
--         지금은 운영센터가 따로 받고(매뉴얼 9장) 시스템에는 기록이 없었다.
--  사용자 결정 2026-10-07 : 관리자가 교육 3종 이수 확인(일자·확인자)을 기록하고,
--         미이수 파트너는 요청을 수락할 수 없게 한다.
--
--  배포 순서 (운영 중단 방지)
--   - 기존 파트너는 기록이 하나도 없다. 차단을 바로 켜면 모든 파트너가 수락하지 못한다.
--   - 그래서 차단은 partner_training_enforcement(기본 false) 로 분리한다.
--     ① 이 마이그레이션 배포 → ② 관리자가 기존 파트너 이수 기록 입력 → ③ 별도 마이그레이션으로 차단 켜기.
--
--  권한 : 기록·삭제는 심사 담당(전체/심사) + 2단계 인증(can_review_qualifications). 접근 기록을 남긴다.
--         파트너는 본인 기록만 조회한다.
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

-- ---------- 차단 스위치 (단일 행, 기본 꺼짐) ----------
create table if not exists public.partner_training_enforcement (
  id      boolean primary key default true check (id),
  enabled boolean not null default false
);
insert into public.partner_training_enforcement(id) values (true) on conflict (id) do nothing;
alter table public.partner_training_enforcement enable row level security;
revoke all on public.partner_training_enforcement from public, anon, authenticated;

create or replace function public.partner_training_required()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select enabled from public.partner_training_enforcement where id), false);
$$;
revoke all on function public.partner_training_required() from public, anon;
grant execute on function public.partner_training_required() to authenticated;

-- ---------- 이수 기록 ----------
create table if not exists public.partner_trainings (
  partner_id    uuid not null references public.partner_accounts (profile_id) on delete cascade,
  course        text not null check (course in ('BASIC', 'EMERGENCY', 'PRIVACY')),
  completed_on  date not null,
  -- 이수증·출석부 등 증빙 문서명/관리번호. 원본은 운영센터 보관.
  evidence_ref  text not null check (char_length(evidence_ref) between 2 and 200),
  confirmed_by  uuid not null references public.profiles (id),
  confirmed_at  timestamptz not null default now(),
  primary key (partner_id, course)
);

comment on table public.partner_trainings is
  '파트너 교육 이수 확인 기록(매뉴얼 10장, #255). BASIC 기본 업무 / EMERGENCY 응급상황 대응 / PRIVACY 개인정보 보호.';

alter table public.partner_trainings enable row level security;
revoke all on public.partner_trainings from public, anon, authenticated;
grant select on public.partner_trainings to authenticated;

drop policy if exists partner_trainings_select_own on public.partner_trainings;
create policy partner_trainings_select_own on public.partner_trainings
  for select to authenticated using (partner_id = auth.uid());

drop policy if exists partner_trainings_select_review on public.partner_trainings;
create policy partner_trainings_select_review on public.partner_trainings
  for select to authenticated using (public.can_review_qualifications());

-- 3종을 모두 이수했는가
create or replace function public.partner_training_complete(p_partner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select count(distinct course) = 3
    from public.partner_trainings
   where partner_id = p_partner;
$$;
revoke all on function public.partner_training_complete(uuid) from public, anon, authenticated;

-- ---------- 관리자 기록·삭제 ----------
create or replace function public.admin_record_partner_training(
  p_partner      uuid,
  p_course       text,
  p_completed_on date,
  p_evidence_ref text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_review_qualifications() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_course is null or p_course not in ('BASIC', 'EMERGENCY', 'PRIVACY') then
    raise exception 'invalid_course' using errcode = '22023';
  end if;
  if p_completed_on is null or p_completed_on > (now() at time zone 'Asia/Seoul')::date
     or p_completed_on < date '2020-01-01' then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  if p_evidence_ref is null or char_length(trim(p_evidence_ref)) not between 2 and 200 then
    raise exception 'evidence_required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.partner_accounts where profile_id = p_partner) then
    raise exception 'partner_not_found' using errcode = 'P0002';
  end if;

  insert into public.partner_trainings (partner_id, course, completed_on, evidence_ref, confirmed_by)
  values (p_partner, p_course, p_completed_on, trim(p_evidence_ref), auth.uid())
  on conflict (partner_id, course) do update
     set completed_on = excluded.completed_on,
         evidence_ref = excluded.evidence_ref,
         confirmed_by = excluded.confirmed_by,
         confirmed_at = now();

  perform public.log_access('PARTNER_TRAINING_RECORD', 'partner_trainings', null, p_partner, p_course);
end;
$$;
revoke all on function public.admin_record_partner_training(uuid, text, date, text) from public, anon;
grant execute on function public.admin_record_partner_training(uuid, text, date, text) to authenticated;

create or replace function public.admin_clear_partner_training(
  p_partner uuid,
  p_course  text,
  p_reason  text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_review_qualifications() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or char_length(trim(p_reason)) not between 5 and 300 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  delete from public.partner_trainings where partner_id = p_partner and course = p_course;
  if not found then
    raise exception 'training_not_found' using errcode = 'P0002';
  end if;
  perform public.log_access('PARTNER_TRAINING_CLEAR', 'partner_trainings', null, p_partner,
                            p_course || ': ' || trim(p_reason));
end;
$$;
revoke all on function public.admin_clear_partner_training(uuid, text, text) from public, anon;
grant execute on function public.admin_clear_partner_training(uuid, text, text) to authenticated;

-- ---------- 수락 차단 ----------
-- 신규 수락과 거절 → 수락 변경 모두 막는다. 거절 기록은 막지 않는다.
create or replace function public.guard_partner_training_on_accept()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'ACCEPTED'::public.application_status
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and public.partner_training_required()
     and not public.partner_training_complete(new.partner_id) then
    raise exception 'training_required' using errcode = 'P0001',
      hint = '매뉴얼 10장: 교육 이수가 확인되지 않으면 업무를 수락하지 않는다';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_res_apps_training_guard on public.reservation_applications;
create trigger trg_res_apps_training_guard
  before insert or update of status on public.reservation_applications
  for each row execute function public.guard_partner_training_on_accept();

-- ---------- 관리자 목록 ----------
-- 파트너별 이수 현황. 이름·로그인 아이디만 함께 내보낸다(연락처 등은 넣지 않는다).
create or replace function public.admin_list_partner_trainings()
returns table (
  partner_id     uuid,
  name           text,
  login_id       text,
  account_status text,
  courses        jsonb
)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.can_review_qualifications() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.log_access('PARTNER_TRAINING_LIST', 'partner_trainings', null, null, '교육 이수 현황 조회');

  return query
  select a.profile_id, p.name, a.login_id, p.status::text,
         coalesce((
           select jsonb_object_agg(t.course, jsonb_build_object(
                    'completed_on', t.completed_on,
                    'evidence_ref', t.evidence_ref,
                    'confirmed_at', t.confirmed_at))
             from public.partner_trainings t
            where t.partner_id = a.profile_id
         ), '{}'::jsonb)
    from public.partner_accounts a
    join public.profiles p on p.id = a.profile_id
   where p.role = 'PARTNER'
   order by p.status = 'ACTIVE' desc, p.name;
end;
$$;
revoke all on function public.admin_list_partner_trainings() from public, anon;
grant execute on function public.admin_list_partner_trainings() to authenticated;
