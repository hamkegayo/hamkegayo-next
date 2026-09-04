-- =============================================================
-- 파트너 개인정보 접근 3단계 — #66 · #67
--
--  개인정보처리방침(시행일 2026-09-03)이 파트너 제공 범위를 단계로 나눠 공개하고 있다.
--  현재 RLS 는 status = 'MATCHING' 이면 행 전체를 열어주어 방침과 어긋난다.
--
--  ┌ 단계 1  매칭 전 (수락 여부 검토)      — 제5조 ② 단계 1
--  │   이용일자 · 도착 희망시간 · 진료 예약시간 · 예상 소요시간 · 서비스 종류
--  │   · 병원명 · 출발지 지역(동 단위) · 이동 관련 선택사항
--  │   + 거동상태 · 인지상태 (민감정보, 별도 동의 — 제5조 ④)
--  │
--  ├ 단계 2  예약 최종 확정 후 (수행)      — 제5조 ② 단계 2 · 제9조 ②
--  │   + 성명 · 연락처 · 출발지 상세주소 · 병원 주소 · 요청사항
--  │   + 진료·검사 · 진료 목적 · 주의사항
--  │   ⚠️ 기준은 ACCEPTED 가 아니라 **CONFIRMED**(파트너 선택 + 선결제 완료)다.
--  │
--  └ 차단   수행기록 제출 완료 시 / 최대 종료 후 24시간 — 제9조 ④
--
--  근거 조문
--   · 제5조 ③ — 이름·연락처·상세 출발지 주소·구체적 진료 및 진료 목적은
--     예약 최종 확정 전에는 제공하지 않는다
--   · 제5조 ⑤ — 결제정보는 파트너에게 제공하지 않는다
--   · 제9조 ② — 매칭 전에는 단계 1 정보만. 선결제 완료 후에만 단계 2
--   · 제9조 ④ — 수행기록 제출 완료 시까지, 최대 종료 후 24시간. 수락하지 않은
--     파트너는 결정 즉시 차단
--
--  RLS 는 행 단위라 컬럼을 가릴 수 없다. 단계 1 은 정책 대신 RPC 로 노출한다.
--  (#50 의 admin_list_reservations() 와 같은 방식)
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

-- =============================================================
-- 0. 단계 1 을 성립시키는 최소 컬럼
--
--    방침 단계 1 은 '병원명' 과 '거동상태·인지상태' 를 제공 항목으로 적고 있는데
--    지금 스키마에 없다. 주소 자유입력에서 병원명을 뽑을 수 없어 컬럼으로 받는다.
--    나머지 매뉴얼 요구 항목(이동수단·귀가수단·인계자 등)은 수행 단계 정보라 #66 2차.
-- =============================================================
alter table public.reservations
  add column if not exists hospital_name     text,
  -- 민감정보 — 제3조 ①. 단계 1 에서 별도 동의를 받아 제공한다(제5조 ④)
  add column if not exists mobility_status   text,
  add column if not exists cognitive_status  text;

comment on column public.reservations.hospital_name is
  '병원명. 매칭 전 파트너에게 제공되는 단계 1 항목 (처리방침 제5조 ②).';
comment on column public.reservations.mobility_status is
  '거동상태(민감정보). 수행 가능 여부 판단용 — 처리방침 제5조 ④.';
comment on column public.reservations.cognitive_status is
  '인지상태(민감정보). 수행 가능 여부 판단용 — 처리방침 제5조 ④.';

-- =============================================================
-- 1. 주소 → 지역 라벨 (동 단위까지)
--
--    방침이 허용하는 최대 해상도가 '동 단위' 다. 주소가 자유 텍스트라 파싱이
--    항상 성공하지는 않는데, 실패하면 **더 좁게** 나온다(시·도까지). 덜 주는 것은
--    방침 위반이 아니므로 이 방향의 실패는 안전하다.
-- =============================================================
create or replace function public.region_label(p_address text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    array_to_string(
      (
        select array_agg(tok order by ord)
          from (
            select tok, ord
              from unnest(regexp_split_to_array(btrim(coalesce(p_address, '')), '\s+'))
                   with ordinality as t(tok, ord)
             -- 시/도 · 시/군/구 · 읍/면/동 만 남긴다. 도로명·번지는 걸리지 않는다.
             where tok ~ '(특별시|광역시|특별자치시|특별자치도|시|도|군|구|읍|면|동|가)$'
               -- '101동' 같은 건물 표기 제외
               and tok !~ '^[0-9]'
             order by ord
             -- '경기도 성남시 분당구 정자동' 처럼 2단계 시 구조까지 동에 닿게 4개.
             -- 매칭되는 토큰이 행정구역 접미사뿐이라 이보다 더 상세해지지는 않는다.
             limit 4
          ) picked
      ),
      ' '
    ),
    ''
  );
$$;

comment on function public.region_label(text) is
  '자유입력 주소에서 시·도 / 시·군·구 / 읍·면·동 까지만 뽑는다. 파싱 실패 시 더 좁게 반환.';

-- =============================================================
-- 2. 접근 단계 판정
-- =============================================================

-- 단계 1 — 매칭 전 검토 대상인가
--   MATCHING 이고, 거절하지 않은 파트너. (제9조 ④ "수락하지 않은 파트너는 즉시 차단")
--   수락 후 선택을 기다리는 파트너도 아직 '매칭 전' 이므로 단계 1 은 계속 본다.
create or replace function public.partner_in_review(res_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.reservations r
     where r.id = res_id
       and r.status = 'MATCHING'::public.reservation_status
       and not exists (
         select 1
           from public.reservation_applications a
          where a.reservation_id = r.id
            and a.partner_id = auth.uid()
            and a.status in ('REJECTED'::public.application_status,
                             'NOT_SELECTED'::public.application_status)
       )
  );
$$;

comment on function public.partner_in_review(uuid) is
  '매칭 전 검토 단계인가(처리방침 제5조 ② 단계 1). 거절·미선택 파트너는 제외.';

-- 단계 2 — 수행 단계 접근 가능한가
--   확정(선결제 완료)된 본인 배정 건이고, 수행기록 제출 전이며, 종료 후 24시간 이내.
create or replace function public.partner_can_access(res_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.reservations r
      left join public.services s on s.reservation_id = r.id
     where r.id = res_id
       and r.confirmed_partner_id = auth.uid()
       and r.status in ('CONFIRMED'::public.reservation_status,
                        'COMPLETED'::public.reservation_status)
       -- 수행기록 제출 완료 시 종료 (제9조 ④)
       and not exists (
         select 1
           from public.reports rp
          where rp.service_id = s.id
            and rp.status = 'SUBMITTED'::public.report_status
       )
       -- 최대 서비스 종료 후 24시간 (제9조 ④)
       and (s.ended_at is null or s.ended_at > now() - interval '24 hours')
  );
$$;

comment on function public.partner_can_access(uuid) is
  '단계 2 접근 가능 여부. 확정 후 ~ 수행기록 제출 완료 또는 종료 후 24시간 (제9조 ④).';

revoke all on function public.partner_in_review(uuid)  from public, anon;
revoke all on function public.partner_can_access(uuid) from public, anon;
grant execute on function public.partner_in_review(uuid)  to authenticated;
grant execute on function public.partner_can_access(uuid) to authenticated;

-- =============================================================
-- 3. RLS 교체 — 파트너의 예약 직접 조회는 단계 2 에서만
--
--    기존 정책은 status = 'MATCHING' 이면 누구에게나 행 전체를 열어주었다.
--    매칭 전 정보는 아래 RPC 로만 나간다.
-- =============================================================
drop policy if exists "reservations_select_partner" on public.reservations;
create policy "reservations_select_partner"
  on public.reservations for select
  using (public.partner_can_access(id));

-- 서비스 수행 기록도 같은 기간만. 종료 24시간 뒤 정산 조회는
-- partner_list_settlements() 가 최소 항목으로 대신한다.
drop policy if exists "services_select_partner" on public.services;
create policy "services_select_partner"
  on public.services for select
  using (
    auth.uid() = partner_id
    and public.partner_can_access(reservation_id)
  );

-- 리포트 — 제출 완료 시점에 접근이 끝난다(제9조 ④). 작성 중(DRAFT)에는 열려 있다.
drop policy if exists "reports_select_partner" on public.reports;
create policy "reports_select_partner"
  on public.reports for select
  using (
    auth.uid() = partner_id
    and exists (
      select 1 from public.services s
       where s.id = service_id
         and public.partner_can_access(s.reservation_id)
    )
  );

drop policy if exists "reports_update_partner" on public.reports;
create policy "reports_update_partner"
  on public.reports for update
  using (
    auth.uid() = partner_id
    and exists (
      select 1 from public.services s
       where s.id = service_id
         and public.partner_can_access(s.reservation_id)
    )
  )
  with check (auth.uid() = partner_id);

-- 첨부 메타도 동일
drop policy if exists "report_attachments_all_partner" on public.report_attachments;
create policy "report_attachments_all_partner"
  on public.report_attachments for all
  using (
    exists (
      select 1
        from public.reports r
        join public.services s on s.id = r.service_id
       where r.id = report_id
         and r.partner_id = auth.uid()
         and public.partner_can_access(s.reservation_id)
    )
  )
  with check (
    exists (
      select 1
        from public.reports r
        join public.services s on s.id = r.service_id
       where r.id = report_id
         and r.partner_id = auth.uid()
         and public.partner_can_access(s.reservation_id)
    )
  );

-- Storage — 경로가 {partner_uid}/{service_id}/... 라 service_id 로 판정할 수 있다.
drop policy if exists "report_attach_select_own" on storage.objects;
create policy "report_attach_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'report-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.services s
       where s.id::text = (storage.foldername(name))[2]
         and public.partner_can_access(s.reservation_id)
    )
  );

-- =============================================================
-- 4. 단계 1 RPC — 매칭 전에 나가는 유일한 통로
--
--    제5조 ② 단계 1 목록을 그대로 옮겼다. 여기에 없는 것은 내보내지 않는다.
--    특히 제5조 ③ 에 따라 이름·연락처·상세주소·진료내용·진료목적은 빠지고,
--    제5조 ⑤ 에 따라 결제 금액도 빠진다.
-- =============================================================
-- 반환 타입이 바뀌면 create or replace 가 거부되므로 먼저 지운다
drop function if exists public.partner_list_open_reservations(integer, integer);
create or replace function public.partner_list_open_reservations(
  p_limit  integer default 50,
  p_offset integer default 0
)
returns table (
  id               uuid,
  -- 예약번호는 개인정보가 아닌 식별자다. 파트너가 문의·정산에서 건을 지목하는 데 쓴다.
  code             text,
  plan             text,
  use_date         date,
  arrive_time      text,
  reserve_time     text,
  duration         text,
  duration_minutes integer,
  hospital_name    text,
  depart_region    text,
  hospital_region  text,
  mobility_status  text,
  cognitive_status text,
  -- 할증률은 개인정보가 아니라 요금 산정 파라미터다.
  -- 파트너가 자기 예상 지급액을 알아야 수락 여부를 판단할 수 있어 함께 내린다.
  -- 이용자의 결제 금액 자체는 내리지 않는다 (제5조 ⑤).
  surcharge_rate   numeric,
  applied          boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'PARTNER' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select r.id, r.code, r.plan, r.use_date, r.arrive_time, r.reserve_time,
           r.duration, r.duration_minutes,
           r.hospital_name,
           public.region_label(r.depart_address),
           public.region_label(r.hospital_address),
           r.mobility_status, r.cognitive_status, r.surcharge_rate,
           exists (
             select 1 from public.reservation_applications a
              where a.reservation_id = r.id and a.partner_id = auth.uid()
           )
      from public.reservations r
     where r.status = 'MATCHING'::public.reservation_status
       and public.partner_in_review(r.id)
     order by r.use_date, r.reserve_time
     limit  greatest(1, least(coalesce(p_limit, 50), 200))
    offset  greatest(0, coalesce(p_offset, 0));
end;
$$;

comment on function public.partner_list_open_reservations(integer, integer) is
  '매칭 전 파트너에게 노출하는 예약 목록. 처리방침 제5조 ② 단계 1 항목만 반환한다.';

drop function if exists public.partner_get_open_reservation(uuid);
create or replace function public.partner_get_open_reservation(p_id uuid)
returns table (
  id               uuid,
  -- 예약번호는 개인정보가 아닌 식별자다. 파트너가 문의·정산에서 건을 지목하는 데 쓴다.
  code             text,
  plan             text,
  use_date         date,
  arrive_time      text,
  reserve_time     text,
  duration         text,
  duration_minutes integer,
  hospital_name    text,
  depart_region    text,
  hospital_region  text,
  mobility_status  text,
  cognitive_status text,
  -- 할증률은 개인정보가 아니라 요금 산정 파라미터다.
  -- 파트너가 자기 예상 지급액을 알아야 수락 여부를 판단할 수 있어 함께 내린다.
  -- 이용자의 결제 금액 자체는 내리지 않는다 (제5조 ⑤).
  surcharge_rate   numeric,
  applied          boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'PARTNER' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not public.partner_in_review(p_id) then
    raise exception 'not_in_review' using errcode = '42501';
  end if;

  return query
    select r.id, r.code, r.plan, r.use_date, r.arrive_time, r.reserve_time,
           r.duration, r.duration_minutes,
           r.hospital_name,
           public.region_label(r.depart_address),
           public.region_label(r.hospital_address),
           r.mobility_status, r.cognitive_status, r.surcharge_rate,
           exists (
             select 1 from public.reservation_applications a
              where a.reservation_id = r.id and a.partner_id = auth.uid()
           )
      from public.reservations r
     where r.id = p_id;
end;
$$;

comment on function public.partner_get_open_reservation(uuid) is
  '매칭 전 예약 상세(수락 판단용). 단계 1 항목만. 거절·미선택 파트너는 거절된다.';

-- =============================================================
-- 5. 정산 이력 — 접근이 끊긴 뒤에도 파트너가 봐야 하는 최소 항목
--
--    제9조 ④ 로 예약 접근이 차단되면 settlements → services → reservations
--    조인이 끊겨 정산 화면이 비어버린다. 이용자 개인정보 없이
--    예약번호 · 일자 · 금액만 돌려준다.
-- =============================================================
drop function if exists public.partner_list_settlements();
create or replace function public.partner_list_settlements()
returns table (
  id             uuid,
  code           text,
  use_date       date,
  plan           text,
  amount         integer,
  fee            integer,
  net            integer,
  status         public.settlement_status,
  settled_at     timestamptz,
  created_at     timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'PARTNER' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select st.id, r.code, r.use_date, r.plan,
           st.amount, st.fee, st.net, st.status, st.settled_at, st.created_at
      from public.settlements st
      join public.services s     on s.id = st.service_id
      join public.reservations r on r.id = s.reservation_id
     where st.partner_id = auth.uid()
     order by st.created_at desc;
end;
$$;

comment on function public.partner_list_settlements() is
  '파트너 정산 이력. 예약번호·일자·금액만 — 이용자 개인정보는 제외한다 (제9조 ④).';

revoke all on function public.partner_list_open_reservations(integer, integer) from public, anon;
revoke all on function public.partner_get_open_reservation(uuid)               from public, anon;
revoke all on function public.partner_list_settlements()                       from public, anon;
grant execute on function public.partner_list_open_reservations(integer, integer) to authenticated;
grant execute on function public.partner_get_open_reservation(uuid)               to authenticated;
grant execute on function public.partner_list_settlements()                       to authenticated;
