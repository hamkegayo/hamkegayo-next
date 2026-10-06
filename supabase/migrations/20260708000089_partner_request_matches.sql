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
-- 주소를 공백·괄호 기준 토큰으로 나눠 구조로 비교한다 (#233 리뷰).
--  - 첫 토큰이 고른 지역의 시·도(또는 별칭)여야 한다. 주소 중간의 "서울로", "경기도 광주시"의 "광주"는 시·도로 보지 않는다.
--  - 시·군·구·일반구·읍면동 이름은 토큰과 정확히 같아야 한다("중구"가 "중구청로"에 맞지 않게).
-- 시·도가 앞에 없는 주소는 판정하지 않는다(맞지 않음). 정렬 보조라 놓치는 쪽이 잘못 맞는 쪽보다 낫다.
create function public.partner_activity_address_tokens(p_address text)
returns text[] language sql immutable set search_path = '' as $$
  select regexp_split_to_array(btrim(regexp_replace(coalesce(p_address, ''), '[(),·]', ' ', 'g')), '\s+');
$$;

create function public.partner_activity_address_matches(p_selected text[], p_address text)
returns boolean language sql stable security definer set search_path = '' as $$
  with t as (select public.partner_activity_address_tokens(p_address) as tokens)
  select exists (
    select 1
    from t, public.partner_activity_regions g
    join public.partner_activity_regions s on s.code = coalesce(g.ancestors[1], g.code)
    where g.code = any(p_selected)
      and t.tokens[1] = any(public.partner_activity_sido_aliases(s.name))
      and not exists (
        select 1 from public.partner_activity_regions part
        where part.level >= 2
          and (part.code = g.code or part.code = any(g.ancestors))
          and not (part.name = any(t.tokens))
      )
  );
$$;
revoke all on function public.partner_activity_sido_aliases(text), public.partner_activity_address_tokens(text), public.partner_activity_address_matches(text[], text) from public, anon, authenticated;

-- 로그인한 파트너 기준, 매칭 중인 예약별 지역·이동수단 일치 여부.
-- 파트너가 해당 항목을 설정하지 않았으면 null(판정 안 함)이다.
-- 지역: 출발지 또는 병원 중 하나라도 활동 지역에 들어가면 일치 (사용자 결정 2026-10-06).
-- 이동수단: 가는 길·귀가 수단이 모두 있고 모두 파트너가 가능한 수단이면 일치.
--   한쪽이라도 비어 있으면 일치가 아니다 — 이동 조건 누락은 "수락하지 말라는 신호"다 (매뉴얼 대응카드 01, #233 리뷰).
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
        else coalesce(r.transport_to = any(v_profile.transports), false)
          and coalesce(r.transport_home = any(v_profile.transports), false)
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
