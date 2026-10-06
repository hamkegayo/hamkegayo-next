-- #226 예약 출발지·병원 주소의 법정동코드(10자리). 도로명주소 검색 API(juso.go.kr)의 admCd 를 저장한다.
-- 새 개인정보 항목이 아니다 — 이미 받는 출발지·병원 주소에서 나온 행정구역 코드다(처리방침 제2조 예약·이동정보).
-- 파트너 활동 지역 매칭(partner_activity_region_covers)에 쓴다. 코드는 파트너에게 그대로 내보내지 않는다.
-- 직접 입력한 주소·기존 예약은 null 이다. 매칭은 주소 글자에서 시·군·구를 찾는 방식으로 대신한다.
alter table public.reservations
  add column if not exists depart_region_code text
    check (depart_region_code is null or depart_region_code ~ '^[0-9]{10}$'),
  add column if not exists hospital_region_code text
    check (hospital_region_code is null or hospital_region_code ~ '^[0-9]{10}$');

-- 처리방침 제4조 — 예약·서비스 기본정보는 서비스 종료 후 3년. 3년 파기(purge)가 주소를 지울 때 코드도 함께 지운다.
-- 파기 함수 본문을 다시 쓰지 않고, 파기 표시(personal_data_purged_at)가 찍히는 순간에 비운다.
create or replace function public.clear_reservation_region_codes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.personal_data_purged_at is not null and old.personal_data_purged_at is null then
    new.depart_region_code := null;
    new.hospital_region_code := null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_clear_reservation_region_codes on public.reservations;
create trigger trg_clear_reservation_region_codes
  before update of personal_data_purged_at on public.reservations
  for each row execute function public.clear_reservation_region_codes();
