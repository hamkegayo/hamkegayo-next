-- =============================================================
-- 적립 주기 정리 — 후보 단계에서 미결 예약 제외 (#249, PR #258 리뷰)
--
--  93 의 sweep_earn_points() 는 미적립 완료 예약 중 최신 500건을 먼저 고른 뒤
--  추가결제 대기·환불 진행·적립액 0 여부를 earn_reservation_points 안에서 걸렀다.
--  최신 500건이 계속 미결이면(또는 현금 결제가 없어 영영 적립되지 않으면)
--  그보다 오래된 정산 완료 예약이 배치에서 계속 밀린다.
--
--  변경
--   - earn_reservation_points 의 조건을 후보 조회에 그대로 옮긴다:
--     최종 요금 확정, 결제 대기(PENDING) 없음, 환불 요청 PENDING/APPROVED 없음,
--     현금 합계 × 적립률 버림 > 0.
--   - 오래된 건부터 처리한다.
--   - 처리 건수를 인자로 받는다(기본 500, 1-500). cron 호출은 그대로 기본값을 쓴다.
--   적립 판정 자체는 계속 earn_reservation_points 가 한다(잠금·중복 방지 포함).
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

drop function if exists public.sweep_earn_points();

create or replace function public.sweep_earn_points(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid;
  v_count integer := 0;
  v_rate  numeric;
  v_start timestamptz;
begin
  select rate, started_at into v_rate, v_start
    from public.point_earn_policy where id;
  if not found then return 0; end if;

  for v_id in
    select r.id
      from public.reservations r
      join public.services s on s.reservation_id = r.id
     where r.status = 'COMPLETED'::public.reservation_status
       and r.final_amount is not null
       and s.status = 'COMPLETED'::public.service_status
       and not s.no_show
       and s.ended_at >= v_start
       and not exists (
         select 1 from public.points p
          where p.reservation_id = r.id
            and p.reason = 'EARN_PAYMENT'::public.point_reason
       )
       and not exists (
         select 1 from public.payments pp
          where pp.reservation_id = r.id
            and pp.status = 'PENDING'::public.payment_status
       )
       and not exists (
         select 1 from public.refund_requests rr
          where rr.reservation_id = r.id
            and rr.status in ('PENDING'::public.refund_request_status,
                              'APPROVED'::public.refund_request_status)
       )
       and floor(coalesce((
         select sum(pp.gross_amount - pp.discount_amount)
           from public.payments pp
          where pp.reservation_id = r.id
            and pp.status = 'PAID'::public.payment_status
       ), 0) * v_rate) > 0
     order by s.ended_at
     limit least(greatest(coalesce(p_limit, 500), 1), 500)
  loop
    if public.earn_reservation_points(v_id) > 0 then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

comment on function public.sweep_earn_points(integer) is
  '정산이 끝났고 적립액이 있는 미적립 예약을 오래된 순으로 적립한다(기본 최대 500건). 적립한 건수를 반환. cron 전용.';

revoke all on function public.sweep_earn_points(integer)
  from public, anon, authenticated;
