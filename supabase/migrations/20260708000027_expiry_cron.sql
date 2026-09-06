-- =============================================================
-- 만료 정리 스케줄 — Supabase pg_cron (#65)
--
--  왜 Vercel Cron 이 아닌가
--    Vercel Hobby 는 **하루 1회 크론만** 허용한다. vercel.json 에
--    `*/5 * * * *` 를 넣으면 배포가 실패한다
--    ("Hobby accounts are limited to daily cron jobs").
--    결제 기한은 30분이라 하루 1회로는 의미가 없다.
--    #65 가 제시한 두 선택지 중 남은 쪽이 pg_cron 이다.
--
--  덤으로 얻는 것 — HTTP 엔드포인트가 없으니 크론 인증도 필요 없다.
--  외부에서 임의 호출할 표면 자체가 생기지 않는다(#65 마지막 항목).
--
--  ⚠️ 이 배치는 돈을 막는 장치가 아니다. 만료된 선택으로 결제가 통과되는
--     경로는 confirm_reservation_payment 와 승인 라우트가 이미 막고,
--     소프트 홀드도 `payment_deadline > now()` 비교라 자동 무효다.
--     정리하지 않으면 **화면에 선택된 것처럼 남는 것**이 문제다.
--     그래서 이 마이그레이션이 실패해도 결제 안전성은 영향받지 않고,
--     lazy 폴백(lib/expire-matchings.ts)이 조회 시점에 계속 정리한다.
-- =============================================================

create extension if not exists pg_cron;

grant usage on schema cron to postgres;

-- 이미 등록돼 있으면 지우고 다시 건다. 마이그레이션을 다시 적용해도
-- 같은 이름의 잡이 쌓이지 않아야 한다.
-- (unschedule 은 잡이 없으면 예외를 던지므로 존재하는 행에 대해서만 부른다)
do $$
declare
  existing bigint;
begin
  for existing in
    select jobid from cron.job where jobname = 'expiry-sweep'
  loop
    perform cron.unschedule(existing);
  end loop;
end;
$$;

-- pg_cron 은 UTC 로 동작하지만 5분 간격은 표준시와 무관하다.
select cron.schedule(
  'expiry-sweep',
  '*/5 * * * *',
  $cron$select public.run_expiry_sweep()$cron$
);
