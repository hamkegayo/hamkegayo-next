-- #226 5단계: 파트너 수락 대기 목록의 "내 조건에 맞음" 판정.
-- 처리방침 제1조 2호(파트너 매칭). 판정은 서버에서만 하고 참·거짓만 돌려준다.
-- 상세 주소·법정동코드 등 제5조 ③ 항목은 파트너에게 내보내지 않는다.
-- 거동상태·병원명·시간은 단계 1 목록(partner_list_open_reservations)에 이미 있어 화면 서버에서 비교한다.

-- 시·도 별칭. 직접 입력 주소는 "서울", "경기", "전라남도"처럼 줄여 쓰거나 개편 전 이름을 쓴다.
create function public.partner_activity_sido_aliases(p_sido text)
returns text[] language sql immutable set search_path = '' as $$
  select array[p_sido] || case p_sido
    when '서울특별시' then array['서울']
    when '부산광역시' then array['부산']
    when '대구광역시' then array['대구']
    when '인천광역시' then array['인천']
    when '대전광역시' then array['대전']
    when '울산광역시' then array['울산']
    when '세종특별자치시' then array['세종']
    when '경기도' then array['경기']
    when '강원특별자치도' then array['강원도', '강원']
    when '충청북도' then array['충북']
    when '충청남도' then array['충남']
    when '전북특별자치도' then array['전라북도', '전북']
    when '전남광주통합특별시' then array['광주광역시', '광주', '전라남도', '전남']
    when '경상북도' then array['경북']
    when '경상남도' then array['경남']
    when '제주특별자치도' then array['제주도', '제주']
    else array[]::text[]
  end;
$$;

-- 법정동코드가 없는(직접 입력·기존) 주소의 보조 판정.
-- 고른 지역의 시·도 별칭 하나와, 시·군·구·일반구·읍면동 이름이 모두 주소에 있어야 맞는 것으로 본다.
-- "중구"처럼 여러 시·도에 있는 이름도 시·도가 함께 있어야 하므로 다른 지역으로 잘못 맞지 않는다.
create function public.partner_activity_address_matches(p_selected text[], p_address text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(btrim(p_address), '') <> '' and exists (
    select 1
    from public.partner_activity_regions g
    join public.partner_activity_regions s on s.code = coalesce(g.ancestors[1], g.code)
    where g.code = any(p_selected)
      and exists (
        select 1 from unnest(public.partner_activity_sido_aliases(s.name)) a
        where position(a in p_address) > 0
      )
      and not exists (
        select 1 from public.partner_activity_regions part
        where part.level >= 2
          and (part.code = g.code or part.code = any(g.ancestors))
          and position(part.name in p_address) = 0
      )
  );
$$;
revoke all on function public.partner_activity_sido_aliases(text), public.partner_activity_address_matches(text[], text) from public, anon, authenticated;

-- 로그인한 파트너 기준, 매칭 중인 예약별 지역·이동수단 일치 여부.
-- 파트너가 해당 항목을 설정하지 않았으면 null(판정 안 함)이다.
-- 지역: 출발지 또는 병원 중 하나라도 활동 지역에 들어가면 일치 (사용자 결정 2026-10-06).
-- 이동수단: 가는 길·귀가 수단이 모두 파트너가 가능한 수단이면 일치.
create function public.partner_open_reservation_matches(p_ids uuid[])
returns table (reservation_id uuid, region_match boolean, transport_match boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_profile public.partner_activity_profiles;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'PARTNER' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_profile from public.partner_activity_profiles where partner_id = auth.uid();
  return query
    select r.id,
      case when coalesce(cardinality(v_profile.regions), 0) = 0 then null
        else coalesce(public.partner_activity_region_covers(v_profile.regions, r.depart_region_code), false)
          or coalesce(public.partner_activity_region_covers(v_profile.regions, r.hospital_region_code), false)
          or (r.depart_region_code is null and public.partner_activity_address_matches(v_profile.regions, r.depart_address))
          or (r.hospital_region_code is null and public.partner_activity_address_matches(v_profile.regions, r.hospital_address))
      end,
      case when coalesce(cardinality(v_profile.transports), 0) = 0 then null
        else (r.transport_to is null or r.transport_to = any(v_profile.transports))
          and (r.transport_home is null or r.transport_home = any(v_profile.transports))
      end
    from public.reservations r
    where r.id = any(p_ids[1:200])
      and r.status = 'MATCHING'::public.reservation_status
      and public.partner_in_review(r.id);
end;
$$;
revoke all on function public.partner_open_reservation_matches(uuid[]) from public, anon;
grant execute on function public.partner_open_reservation_matches(uuid[]) to authenticated;
comment on function public.partner_open_reservation_matches(uuid[]) is
  '#226 수락 대기 예약별 활동 지역·이동수단 일치 여부(참·거짓만). 주소·코드는 반환하지 않는다.';
