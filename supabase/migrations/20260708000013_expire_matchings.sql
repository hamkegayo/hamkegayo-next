-- =============================================================
-- 미확정 매칭 예약 자동 만료
--  - 진료일시(use_date + reserve_time, KST 기준)가 지난 MATCHING 예약을
--    CANCELLED 로 전환한다.
--  - 조회 시점(lazy)에 서버(service_role/admin)에서 호출하여 방치된
--    유령 예약(파트너 목록 노출)을 정리한다.
--  - security definer: RLS 를 우회해 소유자와 무관하게 만료 처리.
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

-- reserve_time 은 "15시 30분" 또는 "15:30" 등 다양한 표기로 저장될 수 있어
-- 숫자 두 개(시/분)를 추출해 진료일시를 구성한다. 분이 없으면 0.
create or replace function public.expire_past_matchings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  update public.reservations
     set status = 'CANCELLED'
   where status = 'MATCHING'
     and reserve_time ~ '\d'
     and (
       (
         use_date::date
         + make_time(
             (regexp_match(reserve_time, '(\d{1,2})'))[1]::int,
             coalesce(
               (regexp_match(reserve_time, '\d{1,2}\D+(\d{1,2})'))[1]::int,
               0
             ),
             0
           )
       ) at time zone 'Asia/Seoul'
     ) < now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

comment on function public.expire_past_matchings() is
  '진료일시가 지난 MATCHING 예약을 CANCELLED 로 전환(조회 시 lazy 호출). 만료 건수 반환.';
