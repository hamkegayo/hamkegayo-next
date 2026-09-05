-- =============================================================
-- 보존기간 파기 스케줄 (#72) — Supabase pg_cron
--
--  왜 Vercel Cron 이 아닌가
--    Hobby 는 크론을 **2개까지만** 허용하고, 그 둘은 이미 keepalive 와
--    추가결제 독촉이 쓰고 있다(#75). 자리가 없다.
--    파기는 HTTP 표면이 필요 없는 순수 DB 작업이라 pg_cron 이 더 맞다 —
--    외부에서 임의로 호출할 엔드포인트 자체가 생기지 않는다.
--
--  왜 5분 배치(expiry-sweep)에 붙이지 않는가
--    파기는 하루 1회면 충분하다. "지체 없이"(제11조 ①)가 5분마다를
--    뜻하지 않는다. 5분마다 전체 테이블을 훑을 이유가 없다.
-- =============================================================

create extension if not exists pg_cron;

grant usage on schema cron to postgres;

-- 다시 적용해도 같은 이름의 잡이 쌓이지 않아야 한다.
do $$
declare
  existing bigint;
begin
  for existing in
    select jobid from cron.job where jobname = 'retention-purge'
  loop
    perform cron.unschedule(existing);
  end loop;
end;
$$;

-- pg_cron 은 UTC 로 돈다. 18:10 UTC = KST 03:10 — 트래픽이 가장 적은 시간대다.
select cron.schedule(
  'retention-purge',
  '10 18 * * *',
  $cron$select public.run_retention_purge()$cron$
);
