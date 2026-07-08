-- 전체 스키마 점검 (SQL Editor에서 실행 → 단일 JSON 결과를 복사)
-- public 스키마의 테이블/컬럼/enum/함수/트리거/RLS/정책 + auth.users 트리거를 한 번에 조회.
select jsonb_pretty(jsonb_build_object(
  'tables', (
    select jsonb_agg(table_name order by table_name)
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  ),
  'columns', (
    select jsonb_object_agg(table_name, cols)
    from (
      select table_name,
             jsonb_agg(
               column_name || ' ' || data_type ||
               (case when is_nullable = 'NO' then ' NOT NULL' else '' end) ||
               (case when column_default is not null then ' default ' || column_default else '' end)
               order by ordinal_position
             ) as cols
      from information_schema.columns
      where table_schema = 'public'
      group by table_name
    ) c
  ),
  'enums', (
    select jsonb_object_agg(typname, vals)
    from (
      select t.typname, jsonb_agg(e.enumlabel order by e.enumsortorder) as vals
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
      group by t.typname
    ) x
  ),
  'functions', (
    select jsonb_agg(proname order by proname)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ),
  'triggers', (
    select jsonb_agg(jsonb_build_object(
      'table', tgrelid::regclass::text,
      'name', tgname,
      'fn', tgfoid::regproc::text
    ))
    from pg_trigger
    where not tgisinternal
      and (tgrelid::regclass::text like 'public.%' or tgrelid = 'auth.users'::regclass)
  ),
  'rls_enabled', (
    select jsonb_object_agg(relname, relrowsecurity)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  ),
  'policies', (
    select jsonb_agg(jsonb_build_object(
      'table', tablename, 'name', policyname, 'cmd', cmd
    ))
    from pg_policies
    where schemaname = 'public'
  ),
  'foreign_keys', (
    select jsonb_agg(jsonb_build_object(
      'table', conrelid::regclass::text,
      'def', pg_get_constraintdef(oid)
    ))
    from pg_constraint
    where connamespace = 'public'::regnamespace and contype = 'f'
  )
)) as schema_report;
