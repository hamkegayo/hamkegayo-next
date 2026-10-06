-- #226 파트너 활동 정보(활동 지역·요일별 시간·이동수단·보행 보조·선호 병원) 저장과 고객 공개 v2.
-- 처리방침 제1조 2호(파트너 매칭) — 매칭은 제5조 단계 1 제공 정보와 파트너 설정을 서버에서 비교만 한다.
-- 처리방침 제16조 ③ — 공개 항목이 늘어나므로 활동 정보는 고지 v2에 동의한 파트너만 공개한다.
-- 이용약관 제13조 ③④ — 서비스 제공시간 매일 07:00~19:00. 활동 시간은 이 범위 안에서만 받는다.
-- 매뉴얼 2장 — 파트너는 운전하지 않는다. 이동수단은 예약의 4종(reservations_transport_check)과 같다.
-- 고객 공개는 partner_activity_release(기본 false)를 고지 v2 배포 후 켤 때만 열린다.

-- 시·도 / 시·군·구 목록. 일반구가 있는 시는 시 단위로만 둔다(구 개편에 덜 흔들리게).
-- 2026-10 기준: 대구 군위군, 인천 제물포구·영종구·검단구, 강원·전북 특별자치도 반영. 출시 전 행정표준코드와 대조한다.
create table public.partner_activity_regions (
  key text primary key,
  sido text not null,
  sigungu text,
  sort_order integer not null unique,
  check (key = sido || coalesce(' ' || sigungu, ''))
);
insert into public.partner_activity_regions(key, sido, sigungu, sort_order) values
('서울특별시','서울특별시',null,1),
('서울특별시 종로구','서울특별시','종로구',2),
('서울특별시 중구','서울특별시','중구',3),
('서울특별시 용산구','서울특별시','용산구',4),
('서울특별시 성동구','서울특별시','성동구',5),
('서울특별시 광진구','서울특별시','광진구',6),
('서울특별시 동대문구','서울특별시','동대문구',7),
('서울특별시 중랑구','서울특별시','중랑구',8),
('서울특별시 성북구','서울특별시','성북구',9),
('서울특별시 강북구','서울특별시','강북구',10),
('서울특별시 도봉구','서울특별시','도봉구',11),
('서울특별시 노원구','서울특별시','노원구',12),
('서울특별시 은평구','서울특별시','은평구',13),
('서울특별시 서대문구','서울특별시','서대문구',14),
('서울특별시 마포구','서울특별시','마포구',15),
('서울특별시 양천구','서울특별시','양천구',16),
('서울특별시 강서구','서울특별시','강서구',17),
('서울특별시 구로구','서울특별시','구로구',18),
('서울특별시 금천구','서울특별시','금천구',19),
('서울특별시 영등포구','서울특별시','영등포구',20),
('서울특별시 동작구','서울특별시','동작구',21),
('서울특별시 관악구','서울특별시','관악구',22),
('서울특별시 서초구','서울특별시','서초구',23),
('서울특별시 강남구','서울특별시','강남구',24),
('서울특별시 송파구','서울특별시','송파구',25),
('서울특별시 강동구','서울특별시','강동구',26),
('부산광역시','부산광역시',null,27),
('부산광역시 중구','부산광역시','중구',28),
('부산광역시 서구','부산광역시','서구',29),
('부산광역시 동구','부산광역시','동구',30),
('부산광역시 영도구','부산광역시','영도구',31),
('부산광역시 부산진구','부산광역시','부산진구',32),
('부산광역시 동래구','부산광역시','동래구',33),
('부산광역시 남구','부산광역시','남구',34),
('부산광역시 북구','부산광역시','북구',35),
('부산광역시 해운대구','부산광역시','해운대구',36),
('부산광역시 사하구','부산광역시','사하구',37),
('부산광역시 금정구','부산광역시','금정구',38),
('부산광역시 강서구','부산광역시','강서구',39),
('부산광역시 연제구','부산광역시','연제구',40),
('부산광역시 수영구','부산광역시','수영구',41),
('부산광역시 사상구','부산광역시','사상구',42),
('부산광역시 기장군','부산광역시','기장군',43),
('대구광역시','대구광역시',null,44),
('대구광역시 중구','대구광역시','중구',45),
('대구광역시 동구','대구광역시','동구',46),
('대구광역시 서구','대구광역시','서구',47),
('대구광역시 남구','대구광역시','남구',48),
('대구광역시 북구','대구광역시','북구',49),
('대구광역시 수성구','대구광역시','수성구',50),
('대구광역시 달서구','대구광역시','달서구',51),
('대구광역시 달성군','대구광역시','달성군',52),
('대구광역시 군위군','대구광역시','군위군',53),
('인천광역시','인천광역시',null,54),
('인천광역시 제물포구','인천광역시','제물포구',55),
('인천광역시 영종구','인천광역시','영종구',56),
('인천광역시 미추홀구','인천광역시','미추홀구',57),
('인천광역시 연수구','인천광역시','연수구',58),
('인천광역시 남동구','인천광역시','남동구',59),
('인천광역시 부평구','인천광역시','부평구',60),
('인천광역시 계양구','인천광역시','계양구',61),
('인천광역시 서구','인천광역시','서구',62),
('인천광역시 검단구','인천광역시','검단구',63),
('인천광역시 강화군','인천광역시','강화군',64),
('인천광역시 옹진군','인천광역시','옹진군',65),
('광주광역시','광주광역시',null,66),
('광주광역시 동구','광주광역시','동구',67),
('광주광역시 서구','광주광역시','서구',68),
('광주광역시 남구','광주광역시','남구',69),
('광주광역시 북구','광주광역시','북구',70),
('광주광역시 광산구','광주광역시','광산구',71),
('대전광역시','대전광역시',null,72),
('대전광역시 동구','대전광역시','동구',73),
('대전광역시 중구','대전광역시','중구',74),
('대전광역시 서구','대전광역시','서구',75),
('대전광역시 유성구','대전광역시','유성구',76),
('대전광역시 대덕구','대전광역시','대덕구',77),
('울산광역시','울산광역시',null,78),
('울산광역시 중구','울산광역시','중구',79),
('울산광역시 남구','울산광역시','남구',80),
('울산광역시 동구','울산광역시','동구',81),
('울산광역시 북구','울산광역시','북구',82),
('울산광역시 울주군','울산광역시','울주군',83),
('세종특별자치시','세종특별자치시',null,84),
('경기도','경기도',null,85),
('경기도 수원시','경기도','수원시',86),
('경기도 성남시','경기도','성남시',87),
('경기도 의정부시','경기도','의정부시',88),
('경기도 안양시','경기도','안양시',89),
('경기도 부천시','경기도','부천시',90),
('경기도 광명시','경기도','광명시',91),
('경기도 평택시','경기도','평택시',92),
('경기도 동두천시','경기도','동두천시',93),
('경기도 안산시','경기도','안산시',94),
('경기도 고양시','경기도','고양시',95),
('경기도 과천시','경기도','과천시',96),
('경기도 구리시','경기도','구리시',97),
('경기도 남양주시','경기도','남양주시',98),
('경기도 오산시','경기도','오산시',99),
('경기도 시흥시','경기도','시흥시',100),
('경기도 군포시','경기도','군포시',101),
('경기도 의왕시','경기도','의왕시',102),
('경기도 하남시','경기도','하남시',103),
('경기도 용인시','경기도','용인시',104),
('경기도 파주시','경기도','파주시',105),
('경기도 이천시','경기도','이천시',106),
('경기도 안성시','경기도','안성시',107),
('경기도 김포시','경기도','김포시',108),
('경기도 화성시','경기도','화성시',109),
('경기도 광주시','경기도','광주시',110),
('경기도 양주시','경기도','양주시',111),
('경기도 포천시','경기도','포천시',112),
('경기도 여주시','경기도','여주시',113),
('경기도 연천군','경기도','연천군',114),
('경기도 가평군','경기도','가평군',115),
('경기도 양평군','경기도','양평군',116),
('강원특별자치도','강원특별자치도',null,117),
('강원특별자치도 춘천시','강원특별자치도','춘천시',118),
('강원특별자치도 원주시','강원특별자치도','원주시',119),
('강원특별자치도 강릉시','강원특별자치도','강릉시',120),
('강원특별자치도 동해시','강원특별자치도','동해시',121),
('강원특별자치도 태백시','강원특별자치도','태백시',122),
('강원특별자치도 속초시','강원특별자치도','속초시',123),
('강원특별자치도 삼척시','강원특별자치도','삼척시',124),
('강원특별자치도 홍천군','강원특별자치도','홍천군',125),
('강원특별자치도 횡성군','강원특별자치도','횡성군',126),
('강원특별자치도 영월군','강원특별자치도','영월군',127),
('강원특별자치도 평창군','강원특별자치도','평창군',128),
('강원특별자치도 정선군','강원특별자치도','정선군',129),
('강원특별자치도 철원군','강원특별자치도','철원군',130),
('강원특별자치도 화천군','강원특별자치도','화천군',131),
('강원특별자치도 양구군','강원특별자치도','양구군',132),
('강원특별자치도 인제군','강원특별자치도','인제군',133),
('강원특별자치도 고성군','강원특별자치도','고성군',134),
('강원특별자치도 양양군','강원특별자치도','양양군',135),
('충청북도','충청북도',null,136),
('충청북도 청주시','충청북도','청주시',137),
('충청북도 충주시','충청북도','충주시',138),
('충청북도 제천시','충청북도','제천시',139),
('충청북도 보은군','충청북도','보은군',140),
('충청북도 옥천군','충청북도','옥천군',141),
('충청북도 영동군','충청북도','영동군',142),
('충청북도 증평군','충청북도','증평군',143),
('충청북도 진천군','충청북도','진천군',144),
('충청북도 괴산군','충청북도','괴산군',145),
('충청북도 음성군','충청북도','음성군',146),
('충청북도 단양군','충청북도','단양군',147),
('충청남도','충청남도',null,148),
('충청남도 천안시','충청남도','천안시',149),
('충청남도 공주시','충청남도','공주시',150),
('충청남도 보령시','충청남도','보령시',151),
('충청남도 아산시','충청남도','아산시',152),
('충청남도 서산시','충청남도','서산시',153),
('충청남도 논산시','충청남도','논산시',154),
('충청남도 계룡시','충청남도','계룡시',155),
('충청남도 당진시','충청남도','당진시',156),
('충청남도 금산군','충청남도','금산군',157),
('충청남도 부여군','충청남도','부여군',158),
('충청남도 서천군','충청남도','서천군',159),
('충청남도 청양군','충청남도','청양군',160),
('충청남도 홍성군','충청남도','홍성군',161),
('충청남도 예산군','충청남도','예산군',162),
('충청남도 태안군','충청남도','태안군',163),
('전북특별자치도','전북특별자치도',null,164),
('전북특별자치도 전주시','전북특별자치도','전주시',165),
('전북특별자치도 군산시','전북특별자치도','군산시',166),
('전북특별자치도 익산시','전북특별자치도','익산시',167),
('전북특별자치도 정읍시','전북특별자치도','정읍시',168),
('전북특별자치도 남원시','전북특별자치도','남원시',169),
('전북특별자치도 김제시','전북특별자치도','김제시',170),
('전북특별자치도 완주군','전북특별자치도','완주군',171),
('전북특별자치도 진안군','전북특별자치도','진안군',172),
('전북특별자치도 무주군','전북특별자치도','무주군',173),
('전북특별자치도 장수군','전북특별자치도','장수군',174),
('전북특별자치도 임실군','전북특별자치도','임실군',175),
('전북특별자치도 순창군','전북특별자치도','순창군',176),
('전북특별자치도 고창군','전북특별자치도','고창군',177),
('전북특별자치도 부안군','전북특별자치도','부안군',178),
('전라남도','전라남도',null,179),
('전라남도 목포시','전라남도','목포시',180),
('전라남도 여수시','전라남도','여수시',181),
('전라남도 순천시','전라남도','순천시',182),
('전라남도 나주시','전라남도','나주시',183),
('전라남도 광양시','전라남도','광양시',184),
('전라남도 담양군','전라남도','담양군',185),
('전라남도 곡성군','전라남도','곡성군',186),
('전라남도 구례군','전라남도','구례군',187),
('전라남도 고흥군','전라남도','고흥군',188),
('전라남도 보성군','전라남도','보성군',189),
('전라남도 화순군','전라남도','화순군',190),
('전라남도 장흥군','전라남도','장흥군',191),
('전라남도 강진군','전라남도','강진군',192),
('전라남도 해남군','전라남도','해남군',193),
('전라남도 영암군','전라남도','영암군',194),
('전라남도 무안군','전라남도','무안군',195),
('전라남도 함평군','전라남도','함평군',196),
('전라남도 영광군','전라남도','영광군',197),
('전라남도 장성군','전라남도','장성군',198),
('전라남도 완도군','전라남도','완도군',199),
('전라남도 진도군','전라남도','진도군',200),
('전라남도 신안군','전라남도','신안군',201),
('경상북도','경상북도',null,202),
('경상북도 포항시','경상북도','포항시',203),
('경상북도 경주시','경상북도','경주시',204),
('경상북도 김천시','경상북도','김천시',205),
('경상북도 안동시','경상북도','안동시',206),
('경상북도 구미시','경상북도','구미시',207),
('경상북도 영주시','경상북도','영주시',208),
('경상북도 영천시','경상북도','영천시',209),
('경상북도 상주시','경상북도','상주시',210),
('경상북도 문경시','경상북도','문경시',211),
('경상북도 경산시','경상북도','경산시',212),
('경상북도 의성군','경상북도','의성군',213),
('경상북도 청송군','경상북도','청송군',214),
('경상북도 영양군','경상북도','영양군',215),
('경상북도 영덕군','경상북도','영덕군',216),
('경상북도 청도군','경상북도','청도군',217),
('경상북도 고령군','경상북도','고령군',218),
('경상북도 성주군','경상북도','성주군',219),
('경상북도 칠곡군','경상북도','칠곡군',220),
('경상북도 예천군','경상북도','예천군',221),
('경상북도 봉화군','경상북도','봉화군',222),
('경상북도 울진군','경상북도','울진군',223),
('경상북도 울릉군','경상북도','울릉군',224),
('경상남도','경상남도',null,225),
('경상남도 창원시','경상남도','창원시',226),
('경상남도 진주시','경상남도','진주시',227),
('경상남도 통영시','경상남도','통영시',228),
('경상남도 사천시','경상남도','사천시',229),
('경상남도 김해시','경상남도','김해시',230),
('경상남도 밀양시','경상남도','밀양시',231),
('경상남도 거제시','경상남도','거제시',232),
('경상남도 양산시','경상남도','양산시',233),
('경상남도 의령군','경상남도','의령군',234),
('경상남도 함안군','경상남도','함안군',235),
('경상남도 창녕군','경상남도','창녕군',236),
('경상남도 고성군','경상남도','고성군',237),
('경상남도 남해군','경상남도','남해군',238),
('경상남도 하동군','경상남도','하동군',239),
('경상남도 산청군','경상남도','산청군',240),
('경상남도 함양군','경상남도','함양군',241),
('경상남도 거창군','경상남도','거창군',242),
('경상남도 합천군','경상남도','합천군',243),
('제주특별자치도','제주특별자치도',null,244),
('제주특별자치도 제주시','제주특별자치도','제주시',245),
('제주특별자치도 서귀포시','제주특별자치도','서귀포시',246)
;
alter table public.partner_activity_regions enable row level security;
revoke all on public.partner_activity_regions from public, anon, authenticated;
grant select on public.partner_activity_regions to authenticated;
grant all on public.partner_activity_regions to service_role;
create policy partner_activity_regions_read on public.partner_activity_regions for select to authenticated using (true);

-- 고객 공개 스위치. 고지 v2 배포 확인 후 별도 마이그레이션으로 켠다.
create table public.partner_activity_release (
  id boolean primary key default true check (id),
  enabled boolean not null default false
);
insert into public.partner_activity_release(id) values (true);
alter table public.partner_activity_release enable row level security;
revoke all on public.partner_activity_release from public, anon, authenticated;
grant all on public.partner_activity_release to service_role;
create function public.partner_activity_public_enabled()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select enabled from public.partner_activity_release where id), false);
$$;
revoke all on function public.partner_activity_public_enabled() from public;
grant execute on function public.partner_activity_public_enabled() to authenticated, service_role;

-- 시각은 30분 단위(예약 슬롯과 같음). 요일 구분: 평일 / 토요일 / 일요일·공휴일.
-- 한쪽만 비면 비교식이 null 이 되어 CHECK 를 통과하므로 not null 을 명시한다.
create function public.partner_activity_time_ok(p_start time, p_end time)
returns boolean language sql immutable set search_path = '' as $$
  select (p_start is null and p_end is null)
      or (p_start is not null and p_end is not null
          and p_start >= time '07:00' and p_end <= time '19:00' and p_start < p_end
          and extract(second from p_start) = 0 and extract(second from p_end) = 0
          and extract(minute from p_start)::int % 30 = 0 and extract(minute from p_end)::int % 30 = 0);
$$;

create table public.partner_activity_profiles (
  partner_id uuid primary key references public.partner_accounts(profile_id) on delete cascade,
  regions text[] not null default '{}' check (cardinality(regions) <= 30),
  weekday_start time, weekday_end time,
  saturday_start time, saturday_end time,
  holiday_start time, holiday_end time,
  transports text[] not null default '{}'
    check (transports <@ array['WALK','PUBLIC','TAXI','FAMILY_CAR']::text[]),
  -- 예약 거동상태(MOBILITY_OPTIONS)와 같은 값. 파트너가 지원 가능한 상태를 고른다.
  mobility_support text[] not null default '{}'
    check (mobility_support <@ array['스스로 보행 가능','지팡이 사용','보행기(워커) 사용','부축 필요','휠체어 이용']::text[]),
  preferred_hospitals text[] not null default '{}' check (cardinality(preferred_hospitals) <= 10),
  updated_at timestamptz not null default now(),
  check (public.partner_activity_time_ok(weekday_start, weekday_end)),
  check (public.partner_activity_time_ok(saturday_start, saturday_end)),
  check (public.partner_activity_time_ok(holiday_start, holiday_end))
);
alter table public.partner_activity_profiles enable row level security;
revoke all on public.partner_activity_profiles from public, anon, authenticated;
grant select on public.partner_activity_profiles to authenticated;
grant all on public.partner_activity_profiles to service_role;
create policy partner_activity_own on public.partner_activity_profiles for select to authenticated using (partner_id = auth.uid());

create function public.save_partner_activity_profile(
  p_regions text[],
  p_weekday_start time, p_weekday_end time,
  p_saturday_start time, p_saturday_end time,
  p_holiday_start time, p_holiday_end time,
  p_transports text[], p_mobility text[], p_hospitals text[]
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_regions text[] := coalesce(p_regions, '{}');
  v_transports text[] := coalesce(p_transports, '{}');
  v_mobility text[] := coalesce(p_mobility, '{}');
  v_hospitals text[];
begin
  if not exists (
    select 1 from public.partner_accounts a join public.profiles p on p.id = a.profile_id
    where a.profile_id = auth.uid() and p.role = 'PARTNER' and p.status = 'ACTIVE'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if cardinality(v_regions) > 30
     or (select count(distinct r) from unnest(v_regions) r) <> cardinality(v_regions)
     or exists (select 1 from unnest(v_regions) r where not exists (select 1 from public.partner_activity_regions g where g.key = r)) then
    raise exception 'invalid_regions' using errcode = '22023';
  end if;
  if (select count(distinct t) from unnest(v_transports) t) <> cardinality(v_transports)
     or (select count(distinct m) from unnest(v_mobility) m) <> cardinality(v_mobility) then
    raise exception 'invalid_options' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_hospitals, '{}')) h where h is null or length(btrim(h)) not between 1 and 50) then
    raise exception 'invalid_hospitals' using errcode = '22023';
  end if;
  select coalesce(array_agg(d.h order by d.o), '{}') into v_hospitals
  from (
    select btrim(t.h) h, min(t.o) o
    from unnest(coalesce(p_hospitals, '{}')) with ordinality t(h, o)
    group by btrim(t.h)
  ) d;
  if cardinality(v_hospitals) > 10 then
    raise exception 'invalid_hospitals' using errcode = '22023';
  end if;
  insert into public.partner_activity_profiles (
    partner_id, regions, weekday_start, weekday_end, saturday_start, saturday_end,
    holiday_start, holiday_end, transports, mobility_support, preferred_hospitals, updated_at
  ) values (
    auth.uid(), v_regions, p_weekday_start, p_weekday_end, p_saturday_start, p_saturday_end,
    p_holiday_start, p_holiday_end, v_transports, v_mobility, v_hospitals, now()
  )
  on conflict (partner_id) do update set
    regions = excluded.regions,
    weekday_start = excluded.weekday_start, weekday_end = excluded.weekday_end,
    saturday_start = excluded.saturday_start, saturday_end = excluded.saturday_end,
    holiday_start = excluded.holiday_start, holiday_end = excluded.holiday_end,
    transports = excluded.transports, mobility_support = excluded.mobility_support,
    preferred_hospitals = excluded.preferred_hospitals, updated_at = now();
exception
  when check_violation then raise exception 'invalid_activity' using errcode = '22023';
end;
$$;
revoke all on function public.save_partner_activity_profile(text[],time,time,time,time,time,time,text[],text[],text[]) from public, anon;
grant execute on function public.save_partner_activity_profile(text[],time,time,time,time,time,time,text[],text[],text[]) to authenticated;

-- 공개 동의 v2. 활동 정보 공개가 열린 뒤의 새 동의·재동의만 v2('2026-10-06')로 기록한다.
-- v1('2026-10-04') 동의는 기존 공개 항목만 계속 공개한다(소급 확대하지 않음).
create or replace function public.set_partner_public_consent_unreleased(p_consent boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_version text := case when public.partner_activity_public_enabled() then '2026-10-06' else '2026-10-04' end;
begin
  if p_consent is null or not exists (select 1 from public.partner_accounts a join public.profiles p on p.id = a.profile_id where a.profile_id = auth.uid() and p.role = 'PARTNER' and p.status = 'ACTIVE') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.partner_public_profiles(partner_id, consented_at, consent_version)
  values (auth.uid(), case when p_consent then now() end, case when p_consent then v_version end)
  on conflict (partner_id) do update set consented_at = excluded.consented_at, consent_version = excluded.consent_version;
end;
$$;
revoke all on function public.set_partner_public_consent_unreleased(boolean) from public, anon, authenticated;

create or replace function public.get_reservation_partner_detail_unreleased(p_reservation_id uuid, p_partner_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_consent boolean; v_activity_consent boolean; v_result jsonb;
begin
  if not exists (
    select 1 from public.reservations r
    join public.reservation_applications a on a.reservation_id = r.id
    join public.profiles p on p.id = a.partner_id
    where r.id = p_reservation_id and r.customer_id = auth.uid() and r.status = 'MATCHING'
      and a.partner_id = p_partner_id and a.status = 'ACCEPTED' and p.role = 'PARTNER' and p.status = 'ACTIVE'
  ) then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(consented_at is not null and consent_version in ('2026-10-04', '2026-10-06'), false),
         coalesce(consented_at is not null and consent_version = '2026-10-06', false)
    into v_consent, v_activity_consent
  from public.partner_public_profiles where partner_id = p_partner_id;
  v_consent := coalesce(v_consent, false);
  v_activity_consent := coalesce(v_activity_consent, false) and public.partner_activity_public_enabled();
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
    -- 활동 정보는 v2 동의 + 공개 스위치가 모두 있을 때만. 아니면 null.
    'activity', case when v_activity_consent then (
      select jsonb_build_object(
        'regions', to_jsonb(x.regions),
        'times', jsonb_build_object(
          'weekday', case when x.weekday_start is null then null else jsonb_build_array(to_char(x.weekday_start, 'HH24:MI'), to_char(x.weekday_end, 'HH24:MI')) end,
          'saturday', case when x.saturday_start is null then null else jsonb_build_array(to_char(x.saturday_start, 'HH24:MI'), to_char(x.saturday_end, 'HH24:MI')) end,
          'holiday', case when x.holiday_start is null then null else jsonb_build_array(to_char(x.holiday_start, 'HH24:MI'), to_char(x.holiday_end, 'HH24:MI')) end
        ),
        'transports', to_jsonb(x.transports),
        'mobility', to_jsonb(x.mobility_support),
        'hospitals', to_jsonb(x.preferred_hospitals)
      ) from public.partner_activity_profiles x where x.partner_id = p.id
    ) end,
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
revoke all on function public.get_reservation_partner_detail_unreleased(uuid, uuid) from public, anon, authenticated;
