-- =============================================================
-- 정산 수수료 제거
--  - 완료 시 정산 생성 트리거에서 수수료(fee)를 0, 실지급(net)=amount 로 변경.
--  - fee/net 컬럼은 유지(미사용)하여 스키마 변경 최소화.
--  - 기존 정산 행도 fee=0/net=amount 로 정리.
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
  v_plan   text;
  v_amount integer;
begin
  if new.status = 'COMPLETED'::public.service_status
     and old.status is distinct from new.status then

    select plan into v_plan
      from public.reservations
     where id = new.reservation_id;

    v_amount := case when v_plan = 'plus' then 25000 else 20000 end;

    -- 수수료 없음: fee=0, net=amount
    insert into public.settlements (service_id, partner_id, amount, fee, net)
    values (new.id, new.partner_id, v_amount, 0, v_amount)
    on conflict (service_id) do nothing;
  end if;
  return new;
end;
$$;

-- 기존 정산 데이터 정리
update public.settlements
   set fee = 0, net = amount
 where fee <> 0 or net <> amount;
