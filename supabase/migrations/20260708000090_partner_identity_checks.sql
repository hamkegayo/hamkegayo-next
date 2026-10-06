-- #226 3단계: 파트너 생년월일 본인확인 (사용자 결정 2026-10-06).
-- 목적: 본인확인. 면허·자격증 증빙의 생년월일과 대조한다. 고객에게 공개하지 않는다.
-- 보유: 확인·반려 즉시 생년월일을 파기하고 결과(상태·일시·처리자)만 남긴다.
--       처리되지 않은 건은 제출 후 30일이 지나면 자동 파기한다.
-- 처리방침 제1조·제2조·제4조 개정 시행 전에는 수집하지 않는다 — partner_identity_release(기본 false).

create table public.partner_identity_release (
  id boolean primary key default true check (id),
  enabled boolean not null default false
);
insert into public.partner_identity_release(id) values (true);
alter table public.partner_identity_release enable row level security;
revoke all on public.partner_identity_release from public, anon, authenticated;
grant all on public.partner_identity_release to service_role;
create function public.partner_identity_collection_enabled()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select enabled from public.partner_identity_release where id), false);
$$;
revoke all on function public.partner_identity_collection_enabled() from public;
grant execute on function public.partner_identity_collection_enabled() to authenticated, service_role;

create table public.partner_identity_checks (
  partner_id uuid primary key references public.partner_accounts(profile_id) on delete cascade,
  birth_date date,
  status text not null check (status in ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED')),
  submitted_at timestamptz not null default now(),
  purge_after timestamptz not null default now() + interval '30 days',
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  -- 생년월일은 확인 대기 중에만 남는다. 결정·만료 후에는 반드시 비어 있다.
  check ((status = 'PENDING') = (birth_date is not null))
);
alter table public.partner_identity_checks enable row level security;
revoke all on public.partner_identity_checks from public, anon, authenticated;
grant select on public.partner_identity_checks to authenticated;
grant all on public.partner_identity_checks to service_role;
create policy identity_check_own on public.partner_identity_checks for select to authenticated using (partner_id = auth.uid());
create policy identity_check_review on public.partner_identity_checks for select to authenticated using (public.can_review_qualifications());

create function public.submit_partner_birth_date(p_birth_date date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.partner_accounts a join public.profiles p on p.id = a.profile_id
    where a.profile_id = auth.uid() and p.role = 'PARTNER' and p.status = 'ACTIVE'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not public.partner_identity_collection_enabled() then
    raise exception 'partner_identity_release_pending' using errcode = '42501';
  end if;
  if p_birth_date is null or p_birth_date < date '1900-01-01'
     or p_birth_date > (now() at time zone 'Asia/Seoul')::date - interval '18 years' then
    raise exception 'invalid_birth_date' using errcode = '22023';
  end if;
  if exists (select 1 from public.partner_identity_checks where partner_id = auth.uid() and status = 'VERIFIED') then
    raise exception 'already_verified' using errcode = '22023';
  end if;
  insert into public.partner_identity_checks(partner_id, birth_date, status, submitted_at, purge_after, decided_at, decided_by)
  values (auth.uid(), p_birth_date, 'PENDING', now(), now() + interval '30 days', null, null)
  on conflict (partner_id) do update set
    birth_date = excluded.birth_date, status = 'PENDING', submitted_at = now(),
    purge_after = now() + interval '30 days', decided_at = null, decided_by = null;
end;
$$;
revoke all on function public.submit_partner_birth_date(date) from public, anon;
grant execute on function public.submit_partner_birth_date(date) to authenticated;

-- 심사 권한 + 2단계 인증(can_review_qualifications). 결정과 동시에 생년월일을 파기한다.
create function public.admin_decide_partner_identity(p_partner_id uuid, p_verified boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_review_qualifications() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_verified is null or p_reason is null or length(btrim(p_reason)) < 2 or length(p_reason) > 300 then
    raise exception 'invalid_review' using errcode = '22023';
  end if;
  update public.partner_identity_checks
     set status = case when p_verified then 'VERIFIED' else 'REJECTED' end,
         birth_date = null, decided_at = now(), decided_by = auth.uid()
   where partner_id = p_partner_id and status = 'PENDING';
  if not found then raise exception 'identity_check_changed' using errcode = 'P0002'; end if;
  perform public.log_access('PARTNER_IDENTITY_REVIEW', 'partner_identity_checks', p_partner_id, p_partner_id,
    case when p_verified then 'VERIFIED' else 'REJECTED' end || ': ' || btrim(p_reason));
  insert into public.notifications(recipient_id, type, title, body, link)
  values (p_partner_id, 'PARTNER_IDENTITY_REVIEW',
    case when p_verified then '본인확인이 완료되었습니다' else '본인확인이 반려되었습니다' end,
    case when p_verified then '입력하신 생년월일은 확인 후 파기했습니다.'
         else btrim(p_reason) || ' 입력하신 생년월일은 파기했습니다. 다시 제출해 주세요.' end,
    '/partner/profile');
end;
$$;
revoke all on function public.admin_decide_partner_identity(uuid, boolean, text) from public, anon;
grant execute on function public.admin_decide_partner_identity(uuid, boolean, text) to authenticated;

-- 30일이 지난 미처리 생년월일 파기. 매일 실행한다.
create function public.purge_expired_partner_birth_dates()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  update public.partner_identity_checks
     set birth_date = null, status = 'EXPIRED'
   where status = 'PENDING' and purge_after <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.purge_expired_partner_birth_dates() from public, anon, authenticated;
grant execute on function public.purge_expired_partner_birth_dates() to service_role;
select cron.schedule('partner-birth-date-purge', '20 18 * * *',
  'select public.purge_expired_partner_birth_dates();');
