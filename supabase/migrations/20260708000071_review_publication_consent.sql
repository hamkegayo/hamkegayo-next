-- 사용자 결정 2026-10-04: 실제 이용자 별도 공개 동의, 확인된 대리권,
-- 동의일부터 3년 공개 후 재동의. 서비스 동의를 공개 동의로 전용하지 않는다.
-- 정본/증빙 확인 절차 준비 전에는 건강 정보 공개를 서버에서 차단한다.
create table public.review_publication_release (
  id boolean primary key default true check(id),
  health_enabled boolean not null default false
);
insert into public.review_publication_release(id) values(true);
create table public.review_publication_consents (
  id uuid primary key default gen_random_uuid(),
  source text not null check(source in ('site','provided')),
  review_id uuid not null,
  subject_reference text not null check(length(trim(subject_reference)) between 5 and 200),
  consenting_party text not null check(consenting_party in ('ACTUAL_RECIPIENT','VERIFIED_REPRESENTATIVE')),
  authority_evidence_reference text,
  evidence_reference text not null check(length(trim(evidence_reference)) between 5 and 200),
  wording_version text not null check(wording_version='review-publication-2026-10-04-v1'),
  wording_snapshot text not null check(length(trim(wording_snapshot)) >= 100),
  consented_at timestamptz not null,
  expires_at timestamptz not null,
  allowed_items jsonb not null check(jsonb_typeof(allowed_items)='array' and jsonb_array_length(allowed_items)>0),
  verified_by uuid not null references public.profiles(id),
  verified_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  withdrawal_reason text,
  check(expires_at=consented_at + interval '3 years'),
  check(consented_at<=verified_at),
  check(consenting_party<>'VERIFIED_REPRESENTATIVE' or coalesce(length(trim(authority_evidence_reference)),0)>=5)
);
create table public.review_publications (
  source text not null check(source in ('site','provided')),
  review_id uuid not null,
  consent_id uuid not null unique references public.review_publication_consents(id),
  title text not null check(length(title) between 2 and 200),
  content text not null check(length(content) between 1 and 10000),
  contains_health_information boolean not null,
  primary key(source,review_id)
);
alter table public.review_publication_release enable row level security;
alter table public.review_publication_consents enable row level security;
alter table public.review_publications enable row level security;
revoke all on public.review_publication_release,public.review_publication_consents,public.review_publications from public,anon,authenticated,service_role;
grant all on public.review_publication_release to service_role;
grant select on public.review_publication_consents,public.review_publications to service_role;

-- 미검토 원문은 익명 REST / 다른 회원에게 공개하지 않는다. 본인의 등록 결과는 조회 가능.
drop policy if exists reviews_select_public on public.reviews;
create policy reviews_select_owner on public.reviews for select to authenticated using(customer_id=auth.uid());
revoke select on public.reviews from anon;
-- 旧 imported_reviews の時刻一つだけを新しい本人同意の証拠に変換しない。
update public.imported_reviews set published=false;

create function public.admin_publish_review(
  p_source text,p_review_id uuid,p_subject_reference text,p_consenting_party text,
  p_evidence_reference text,p_authority_evidence_reference text,p_consented_at timestamptz,
  p_wording_version text,p_wording_snapshot text,p_allowed_items jsonb,
  p_title text,p_content text,p_contains_health_information boolean
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_consent uuid;
begin
  if not public.is_admin_live() or not exists(select 1 from public.admin_accounts where profile_id=auth.uid() and duty='전체') then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if p_source is null or p_source not in ('site','provided') or p_contains_health_information is null
    or p_consented_at is null or p_consented_at>now() or p_consented_at+interval '3 years'<=now()
    or p_allowed_items is null or jsonb_typeof(p_allowed_items)<>'array' then
    raise exception 'invalid_consent' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_allowed_items) t(item) where jsonb_typeof(item)<>'string' or length(trim(item #>> '{}'))<1) then
    raise exception 'invalid_allowed_items' using errcode='22023';
  end if;
  if p_contains_health_information and not coalesce((select health_enabled from public.review_publication_release where id),false) then
    raise exception 'health_publication_not_ready' using errcode='42501';
  end if;
  if not exists(select 1 from jsonb_array_elements_text(p_allowed_items) t(item) where item='후기 공개본') then
    raise exception 'public_text_not_consented' using errcode='22023';
  end if;
  if p_contains_health_information and jsonb_array_length(p_allowed_items)<2 then
    raise exception 'specific_health_items_required' using errcode='22023';
  end if;
  if (p_source='site' and not exists(select 1 from public.reviews where id=p_review_id))
    or (p_source='provided' and not exists(select 1 from public.imported_reviews where id=p_review_id)) then
    raise exception 'review_not_found' using errcode='P0002';
  end if;
  -- 증빙 참조는 비공개 보관소 식별자다. URL·증빙 본문을 공개 API에 포함하지 않는다.
  insert into public.review_publication_consents(source,review_id,subject_reference,consenting_party,
    evidence_reference,authority_evidence_reference,wording_version,wording_snapshot,
    consented_at,expires_at,allowed_items,verified_by)
  values(p_source,p_review_id,p_subject_reference,p_consenting_party,p_evidence_reference,
    p_authority_evidence_reference,p_wording_version,p_wording_snapshot,p_consented_at,
    p_consented_at+interval '3 years',p_allowed_items,auth.uid()) returning id into v_consent;
  insert into public.review_publications(source,review_id,consent_id,title,content,contains_health_information)
  values(p_source,p_review_id,v_consent,p_title,p_content,p_contains_health_information)
  on conflict(source,review_id) do update set consent_id=excluded.consent_id,title=excluded.title,
    content=excluded.content,contains_health_information=excluded.contains_health_information;
  if p_source='provided' then update public.imported_reviews set published=true where id=p_review_id; end if;
  perform public.log_access('REVIEW_PUBLICATION_APPROVED','review_publication_consents',v_consent,null,'Verified separate publication consent');
  return v_consent;
end $$;

create function public.admin_withdraw_review_publication(p_consent_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin_live() or not exists(select 1 from public.admin_accounts where profile_id=auth.uid() and duty='전체') then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if p_reason is null or length(trim(p_reason))<5 or length(p_reason)>500 then
    raise exception 'withdrawal_reason_required' using errcode='22023';
  end if;
  update public.review_publication_consents set withdrawn_at=now(),withdrawal_reason=trim(p_reason)
    where id=p_consent_id and withdrawn_at is null;
  if not found then raise exception 'consent_not_active' using errcode='P0002'; end if;
  perform public.log_access('REVIEW_PUBLICATION_WITHDRAWN','review_publication_consents',p_consent_id,null,'Publication consent withdrawn');
end $$;
revoke all on function public.admin_publish_review(text,uuid,text,text,text,text,timestamptz,text,text,jsonb,text,text,boolean),
  public.admin_withdraw_review_publication(uuid,text) from public,anon;
grant execute on function public.admin_publish_review(text,uuid,text,text,text,text,timestamptz,text,text,jsonb,text,text,boolean),
  public.admin_withdraw_review_publication(uuid,text) to authenticated;

create or replace function public.get_public_reviews(p_limit integer default 10000)
returns table(id uuid,plan text,title text,content text,author_masked text,rating smallint,reply text,published_at timestamptz,source text)
language sql stable security definer set search_path='' as $$
  select r.id,r.plan,p.title,p.content,r.author_masked,r.rating,null::text,r.published_at,r.source
  from (
    select r.id,b.plan::text,r.author_masked,r.rating,r.created_at published_at,'site'::text source
    from public.reviews r join public.services s on s.id=r.service_id join public.reservations b on b.id=s.reservation_id
    union all
    select r.id,r.plan,r.author_masked,r.rating,r.published_on::timestamp at time zone 'Asia/Seoul','provided'::text
    from public.imported_reviews r where r.published
  ) r join public.review_publications p on p.source=r.source and p.review_id=r.id
  join public.review_publication_consents c on c.id=p.consent_id and c.source=p.source and c.review_id=p.review_id
  where c.withdrawn_at is null and c.consented_at<=now() and c.expires_at>now()
    and (not p.contains_health_information or coalesce((select health_enabled from public.review_publication_release where id),false))
  order by r.published_at desc,r.id desc limit least(greatest(coalesce(p_limit,10000),0),10000);
$$;

-- 파트너 상세도 같은 공개본을 사용한다. 기존 원문·운영 답변의 우회 노출을 막는다.
create or replace function public.get_reservation_partner_detail(p_reservation_id uuid,p_partner_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_detail jsonb; v_reviews jsonb;
begin
  if not public.partner_public_details_enabled() then raise exception 'partner_public_release_pending' using errcode='42501'; end if;
  v_detail:=public.get_reservation_partner_detail_unreleased(p_reservation_id,p_partner_id);
  select coalesce(jsonb_agg(to_jsonb(t) order by t."createdAt" desc,t.id),'[]'::jsonb) into v_reviews from (
    select p.id,p.rating,p.title,p.content,p.author_masked author,p.published_at "createdAt"
    from public.get_public_reviews() p join public.reviews r on r.id=p.id and p.source='site'
    where r.partner_id=p_partner_id order by p.published_at desc,p.id limit 10
  ) t;
  return jsonb_set(v_detail,'{reviews}',v_reviews);
end $$;
