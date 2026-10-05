-- #175: 실제 이용자 공개 동의(사용자 확정 2026-10-04), 3년 만료·철회 유지.
-- 승인 정보를 임의 시드하지 않는다. 전체 관리자 MFA/사유 조회 후 기존 승인 RPC 사용.
create function public.admin_review_publication_queue(p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rows jsonb;
begin
 if not public.is_admin_live() or not exists(select 1 from public.admin_accounts where profile_id=auth.uid() and duty='전체') then
  raise exception 'forbidden' using errcode='42501';
 end if;
 if p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then raise exception 'reason_required'; end if;
 perform public.log_access('REVIEW_PUBLICATION_QUEUE','imported_reviews',null,null,trim(p_reason));
 select coalesce(jsonb_agg(to_jsonb(r) order by r.published_on desc,r.id),'[]') into rows from (
  select i.id,i.title,i.content,i.author_masked,i.plan,i.rating,i.published_on,
   p.consent_id,p.title as public_title,p.content as public_content,p.contains_health_information,
   c.consented_at,c.expires_at,c.withdrawn_at
  from public.imported_reviews i
  left join public.review_publications p on p.source='provided' and p.review_id=i.id
  left join public.review_publication_consents c on c.id=p.consent_id
  where i.source_key like 'provided-pdf-20261004-%'
 ) r;
 return jsonb_build_object('reviews',rows,'healthEnabled',coalesce((select health_enabled from public.review_publication_release where id),false));
end; $$;
revoke all on function public.admin_review_publication_queue(text) from public,anon;
grant execute on function public.admin_review_publication_queue(text) to authenticated;
