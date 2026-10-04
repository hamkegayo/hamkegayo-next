begin;
do $$
declare n integer;
begin
  select count(*) into n from public.imported_reviews where source_key like 'provided-pdf-20261004-%';
  if n <> 12 then raise exception '후기 수 불일치: %', n; end if;
  if (select count(*) from public.imported_reviews where plan = 'basic') <> 5
    or (select count(*) from public.imported_reviews where plan = 'plus') <> 7
    or (select count(*) from public.imported_reviews where rating = 5) <> 10
    or (select count(*) from public.imported_reviews where rating = 4) <> 2 then
    raise exception '상품/별점 불일치';
  end if;
  if exists (select 1 from public.imported_reviews where author_masked !~ '^.O.$') then
    raise exception '실명 노출';
  end if;
  if exists(select 1 from public.get_public_reviews() where source='provided') then
    raise exception '실제 이용자 동의 미확인 후기 노출';
  end if;
  if (select count(*) from public.get_public_reviews(0)) <> 0 then
    raise exception '목록 제한 실패';
  end if;
  if has_table_privilege('anon', 'public.imported_reviews', 'INSERT')
    or has_table_privilege('anon', 'public.imported_reviews', 'SELECT')
    or has_table_privilege('authenticated', 'public.imported_reviews', 'SELECT')
    or has_table_privilege('authenticated', 'public.imported_reviews', 'UPDATE')
    or has_table_privilege('authenticated', 'public.imported_reviews', 'DELETE') then
    raise exception '공개 후기 쓰기 권한 노출';
  end if;
  if not has_function_privilege('anon','public.get_public_reviews(integer)','EXECUTE') then
    raise exception '비로그인 후기 조회 불가';
  end if;
  if exists(select 1 from public.get_public_reviews() where source='provided' and (title||content) ~ '(항암|내시경|수면검사)') then raise exception '구체 건강 정보 노출'; end if;
end $$;
-- 비공개 후기는 RPC 및 직접 조회에서 숨긴다.
update public.imported_reviews set published = false where source_key = 'provided-pdf-20261004-12';
set local role anon;
do $$
begin
  if (select count(*) from public.get_public_reviews() where source = 'provided') <> 0
    then
    raise exception '비공개 후기 노출';
  end if;
  begin perform source_key,consent_confirmed_at,created_at from public.imported_reviews;
    raise exception '내부 열 직접 조회 가능';
  exception when insufficient_privilege then null; end;
  if exists(select 1 from public.get_public_reviews() r where to_jsonb(r) ?| array['source_key','consent_confirmed_at','created_at']) then raise exception 'RPC 내부 열 노출'; end if;
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin perform * from public.imported_reviews; raise exception '인증 사용자 내부 열 직접 조회 가능';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- 멱등 재등록이 기존 내용을 덮어쓰지 않고 새 행도 만들지 않는다.
insert into public.imported_reviews
  (source_key,plan,title,content,author_masked,rating,published_on,consent_confirmed_at)
values ('provided-pdf-20261004-12','basic','덮어쓰기','변경','익명',1,current_date,now())
on conflict (source_key) do nothing;
do $$
begin
  if (select count(*) from public.imported_reviews) <> 12
    or (select title from public.imported_reviews where source_key = 'provided-pdf-20261004-12') <> '다음에도 이용할게요' then
    raise exception '중복 등록 또는 기존 후기 덮어쓰기';
  end if;
end $$;
rollback;
