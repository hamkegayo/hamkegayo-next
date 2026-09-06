-- =============================================================
-- 정산 자동 생성 트리거 복구 — #49 회귀
--
--  증상 : 파트너가 서비스를 완료하면 42P10 으로 실패한다.
--         "there is no unique or exclusion constraint matching the ON CONFLICT specification"
--         → complete_service() 가 통째로 롤백되어 **서비스 완료가 불가능**했다.
--
--  원인 : create_settlement_on_complete() 는 `on conflict (service_id) do nothing` 을 쓴다.
--         #49 가 정산을 payments 파생으로 바꾸면서 settlements_service_id_key(전체 unique)를
--         버리고 부분 unique 인덱스로 교체했다.
--
--           uq_settlements_service_primary
--             on settlements (service_id) where payment_id is null
--
--         postgres 는 부분 인덱스를 ON CONFLICT 대상으로 추론하지 못한다.
--         같은 조건식을 문장에 다시 적어야 인덱스를 지목할 수 있다.
--
--  #49 검증이 결제·포인트 경로만 재현해서 이 트리거를 지나지 않았다.
--  #66 파트너 접근 테스트가 서비스 완료를 거치면서 드러났다.
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

create or replace function public.create_settlement_on_complete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan     text;
  v_final    integer;
  v_prepaid  integer;
  v_fee_rate numeric;
  v_amount   integer;
  v_fee      integer;
begin
  if new.status = 'COMPLETED'::public.service_status
     and old.status is distinct from new.status then

    select plan, final_amount, prepaid_amount, fee_rate
      into v_plan, v_final, v_prepaid, v_fee_rate
      from public.reservations
     where id = new.reservation_id;

    -- 시간 계산은 TS(lib/pricing.ts)가 단일 소스다. 여기서는 확정된 값을 읽기만 한다.
    v_amount := coalesce(
      v_final,
      v_prepaid,
      case when v_plan = 'plus' then 25000 else 20000 end
    );

    v_fee_rate := coalesce(
      v_fee_rate,
      case when v_plan = 'plus' then 0.24 else 0.20 end
    );

    v_fee := round(v_amount * v_fee_rate);

    -- 부분 인덱스(uq_settlements_service_primary)를 지목하려면
    -- 인덱스의 조건식을 그대로 적어야 한다.
    insert into public.settlements (service_id, partner_id, amount, fee, net)
    values (new.id, new.partner_id, v_amount, v_fee, v_amount - v_fee)
    on conflict (service_id) where payment_id is null do nothing;
  end if;
  return new;
end;
$$;

comment on function public.create_settlement_on_complete() is
  '서비스 COMPLETED 시 1차 정산 생성. 취소·환불은 차감 정산을 새로 쌓는다(#49).';
