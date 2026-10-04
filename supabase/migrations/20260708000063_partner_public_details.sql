-- #173: 약관 제9조 ③ — 수락 파트너 정보를 확인한 후 선택.
-- 처리방침 제13조 — 예약 관계 검증 및 최소 정보 접근통제.
-- 공개 동의는 기존 파트너에 소급하지 않는다. 방침의 공개 항목 고지는 배포 전 확인 필요.
create table public.partner_public_profiles (
  partner_id uuid primary key references public.partner_accounts(profile_id) on delete cascade,
  consented_at timestamptz,
  consent_version text,
  check ((consented_at is null) = (consent_version is null))
);
create table public.partner_work_histories (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partner_accounts(profile_id) on delete cascade,
  hospital text not null check (length(trim(hospital)) between 1 and 100),
  period text not null check (length(trim(period)) between 1 and 100),
  department text not null check (length(trim(department)) between 1 and 100),
  duties text not null check (length(trim(duties)) between 1 and 300),
  status public.qualification_status not null default 'PENDING',
  created_at timestamptz not null default now()
);
create index idx_partner_work_histories_partner on public.partner_work_histories(partner_id, created_at desc);
alter table public.partner_public_profiles enable row level security;
alter table public.partner_work_histories enable row level security;
revoke all on public.partner_public_profiles, public.partner_work_histories from anon, authenticated;
grant select on public.partner_public_profiles, public.partner_work_histories to authenticated;
grant all on public.partner_public_profiles, public.partner_work_histories to service_role;
create policy public_profile_own on public.partner_public_profiles for select to authenticated using (partner_id = auth.uid());
create policy work_history_own on public.partner_work_histories for select to authenticated using (partner_id = auth.uid());
create policy work_history_review on public.partner_work_histories for select to authenticated using (public.can_review_qualifications());

create function public.set_partner_public_consent(p_consent boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_consent is null or not exists (select 1 from public.partner_accounts a join public.profiles p on p.id = a.profile_id where a.profile_id = auth.uid() and p.role = 'PARTNER' and p.status = 'ACTIVE') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.partner_public_profiles(partner_id, consented_at, consent_version)
  values (auth.uid(), case when p_consent then now() end, case when p_consent then '2026-10-04' end)
  on conflict (partner_id) do update set consented_at = excluded.consented_at, consent_version = excluded.consent_version;
end;
$$;
create function public.submit_partner_work_history(p_hospital text, p_period text, p_department text, p_duties text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.partner_accounts a join public.profiles p on p.id = a.profile_id where a.profile_id = auth.uid() and p.role = 'PARTNER' and p.status = 'ACTIVE') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- 한 파트너의 동시 등록을 직렬화하여 20개 상한 우회를 막는다.
  perform 1 from public.partner_accounts where profile_id = auth.uid() for update;
  if (select count(*) from public.partner_work_histories where partner_id = auth.uid()) >= 20 then
    raise exception 'history_limit' using errcode = '22023';
  end if;
  insert into public.partner_work_histories(partner_id, hospital, period, department, duties)
  values (auth.uid(), trim(p_hospital), trim(p_period), trim(p_department), trim(p_duties)) returning id into v_id;
  return v_id;
end;
$$;
create function public.delete_partner_work_history(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.partner_work_histories where id = p_id and partner_id = auth.uid();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end;
$$;
create function public.admin_review_work_history(p_id uuid, p_expected public.qualification_status, p_status public.qualification_status, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_partner uuid;
begin
  if not public.can_review_qualifications() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_expected is null or p_status is null or p_expected = p_status or p_reason is null or length(trim(p_reason)) < 5 or length(p_reason) > 500 then
    raise exception 'invalid_review' using errcode = '22023';
  end if;
  update public.partner_work_histories set status = p_status where id = p_id and status = p_expected returning partner_id into v_partner;
  if v_partner is null then raise exception 'history_changed' using errcode = 'P0002'; end if;
  perform public.log_access('WORK_HISTORY_REVIEW', 'partner_work_histories', p_id, v_partner, p_expected::text || ' → ' || p_status::text || ': ' || trim(p_reason));
  insert into public.notifications(recipient_id, type, title, body, link)
  values (v_partner, 'WORK_HISTORY_REVIEW', '근무 경력 심사 결과', trim(p_reason), '/partner/profile');
end;
$$;

create function public.get_reservation_partner_detail(p_reservation_id uuid, p_partner_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_consent boolean; v_result jsonb;
begin
  if not exists (
    select 1 from public.reservations r
    join public.reservation_applications a on a.reservation_id = r.id
    join public.profiles p on p.id = a.partner_id
    where r.id = p_reservation_id and r.customer_id = auth.uid() and r.status = 'MATCHING'
      and a.partner_id = p_partner_id and a.status = 'ACCEPTED' and p.role = 'PARTNER' and p.status = 'ACTIVE'
  ) then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(consented_at is not null and consent_version = '2026-10-04', false) into v_consent
  from public.partner_public_profiles where partner_id = p_partner_id;
  v_consent := coalesce(v_consent, false);
  select jsonb_build_object(
    'partnerId', p.id, 'name', p.name, 'publicConsent', v_consent,
    'intro', case when v_consent then a.intro else null end,
    'workHistory', case when v_consent then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id, 'hospital', w.hospital, 'period', w.period,
        'department', w.department, 'duties', w.duties
      ) order by w.created_at desc, w.id)
      from public.partner_work_histories w
      where w.partner_id = p.id and w.status = 'VERIFIED'
    ), '[]'::jsonb) else '[]'::jsonb end,
    'qualifications', case when v_consent then coalesce((
      select jsonb_agg(jsonb_build_object('type', q.type, 'issuer', q.issuer)
        order by q.created_at desc, q.id)
      from public.partner_qualifications q
      where q.partner_id = p.id and q.status = 'VERIFIED'
    ), '[]'::jsonb) else '[]'::jsonb end,
    'rating', (select avg(r.rating) from public.reviews r where r.partner_id = p.id),
    'reviewCount', (select count(*) from public.reviews r where r.partner_id = p.id),
    'reviews', coalesce((
      select jsonb_agg(to_jsonb(t) order by t."createdAt" desc, t.id)
      from (
        select r.id, r.rating, r.title, r.content,
          r.author_masked as author, r.created_at as "createdAt"
        from public.reviews r where r.partner_id = p.id
        order by r.created_at desc, r.id limit 10
      ) t
    ), '[]'::jsonb)
  ) into v_result
  from public.profiles p
  join public.partner_accounts a on a.profile_id = p.id
  where p.id = p_partner_id;
  return v_result;
end;
$$;
revoke all on function public.set_partner_public_consent(boolean), public.submit_partner_work_history(text,text,text,text), public.delete_partner_work_history(uuid), public.admin_review_work_history(uuid,public.qualification_status,public.qualification_status,text), public.get_reservation_partner_detail(uuid,uuid) from public, anon;
grant execute on function public.set_partner_public_consent(boolean), public.submit_partner_work_history(text,text,text,text), public.delete_partner_work_history(uuid), public.admin_review_work_history(uuid,public.qualification_status,public.qualification_status,text), public.get_reservation_partner_detail(uuid,uuid) to authenticated;
