-- #190: 후기별 공개 동의·만료·철회 기준(71)을 선택 카드 집계에도 적용한다.
-- 원문 reviews의 작성자 전용 RLS를 완화하지 않는다.
create function public.get_reservation_applicant_ratings(p_reservation_id uuid)
returns table(partner_id uuid, rating numeric, review_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.reservations r
    where r.id=p_reservation_id and r.customer_id=auth.uid() and r.status='MATCHING'
  ) then raise exception 'not_owner_or_not_matching' using errcode='42501'; end if;
  return query
    select a.partner_id, avg(p.rating)::numeric, count(p.id)
    from public.reservation_applications a
    left join public.reviews r on r.partner_id=a.partner_id
    left join public.get_public_reviews() p on p.id=r.id and p.source='site'
    where a.reservation_id=p_reservation_id and a.status='ACCEPTED'
    group by a.partner_id;
end $$;
revoke all on function public.get_reservation_applicant_ratings(uuid) from public,anon;
grant execute on function public.get_reservation_applicant_ratings(uuid) to authenticated;
