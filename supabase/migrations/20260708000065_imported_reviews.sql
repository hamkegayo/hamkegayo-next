-- #175: 공개 동의가 확인된 기존 이용 후기. 가짜 서비스/회원/파트너를 만들지 않는다.
-- 개인정보처리방침 제3조: 실명·원본 PDF는 저장하지 않고 마스킹된 공개 내용만 보관.
create table if not exists public.imported_reviews (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  plan text not null check (plan in ('basic', 'plus')),
  title text not null check (length(title) between 2 and 200),
  content text not null check (length(content) between 1 and 10000),
  author_masked text not null,
  rating smallint not null check (rating between 1 and 5),
  published_on date not null,
  published boolean not null default false,
  consent_confirmed_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.imported_reviews enable row level security;
revoke all on public.imported_reviews from anon, authenticated;
grant select on public.imported_reviews to anon, authenticated;
grant all on public.imported_reviews to service_role;
drop policy if exists imported_reviews_public on public.imported_reviews;
create policy imported_reviews_public on public.imported_reviews for select
  to anon, authenticated using (published);

-- 공개 후기 필드만 반환. 기존 services/reservations RLS를 공개하지 않고 상품명만 결합.
create or replace function public.get_public_reviews(p_limit integer default 10000)
returns table (
  id uuid, plan text, title text, content text, author_masked text,
  rating smallint, reply text, published_at timestamptz, source text
)
language sql stable security definer set search_path = ''
as $$
  select * from (
    select r.id, b.plan::text, r.title, r.content, r.author_masked,
      r.rating, r.reply, r.created_at as published_at, 'site'::text as source
    from public.reviews r
    join public.services s on s.id = r.service_id
    join public.reservations b on b.id = s.reservation_id
    union all
    select r.id, r.plan, r.title, r.content, r.author_masked,
      r.rating, null::text, r.published_on::timestamp at time zone 'Asia/Seoul', 'provided'::text
    from public.imported_reviews r where r.published
  ) reviews
  order by published_at desc, id desc
  limit least(greatest(coalesce(p_limit, 10000), 0), 10000);
$$;
revoke all on function public.get_public_reviews(integer) from public;
grant execute on function public.get_public_reviews(integer) to anon, authenticated, service_role;
comment on table public.imported_reviews is '공개 동의된 외부 제공 후기. 파트너 평점 및 실적에 합산하지 않음.';

-- 사용자 2026-10-04 공개 동의 확인. source_key 중복 시 기존 후기 덮어쓰기 금지.
insert into public.imported_reviews
  (id, source_key, plan, title, content, author_masked, rating, published_on, published, consent_confirmed_at)
select id, source_key, plan, title, content, author_masked, rating, published_on, true,
  '2026-10-04T00:00:00+09:00'::timestamptz
from jsonb_to_recordset($reviews$[{"id": "00000175-0000-4000-8000-000000000012", "source_key": "provided-pdf-20261004-12", "plan": "plus", "title": "다음에도 이용할게요", "author_masked": "김O희", "rating": 5, "published_on": "2026-10-02", "content": "갑자기 잡힌 검사라 제가 시간을 뺄 수가 없어서 급하게 신청했습니다. 처음 이용하는 서비스라 걱정했는데 약속시간도 잘 맞춰주시고 병원 안에서 필요한 것들을 하나씩 챙겨주셨어요. 어머니도 혼자 갔으면 힘들었을 것 같다고 하시네요. 덕분에 검사 잘 받고 오셨습니다. 다음에도 일정이 안 맞을 때 이용하려고 합니다."}, {"id": "00000175-0000-4000-8000-000000000011", "source_key": "provided-pdf-20261004-11", "plan": "basic", "title": "오늘 감사합니다^^", "author_masked": "박O영", "rating": 5, "published_on": "2026-09-28", "content": "어머니가 대학병원 진료가 있으셔서 부탁드렸습니다. 병원이 워낙 크고 진료과도 찾아가기 어려워서 혼자 보내드리기가 걱정됐는데 잘 도와주셨어요. 대기시간이 생각보다 길어졌는데도 끝까지 같이 있어주셨다고 들었습니다. 덕분에 저도 회사에서 마음 놓고 일할 수 있었어요. 감사합니다^^"}, {"id": "00000175-0000-4000-8000-000000000010", "source_key": "provided-pdf-20261004-10", "plan": "plus", "title": "검사가 많았는데 잘 챙겨주셨어요", "author_masked": "이O진", "rating": 5, "published_on": "2026-09-24", "content": "오전에 검사 두 개를 받고 오후에는 진료까지 있는 날이라 혼자 다녀오시기에는 일정이 복잡했습니다. 검사실도 각각 다른 곳이라 걱정했는데 순서대로 이동하면서 잘 챙겨주셨어요. 중간에 진행 상황도 확인할 수 있어서 제가 계속 부모님께 전화하지 않아도 돼서 편했습니다."}, {"id": "00000175-0000-4000-8000-000000000009", "source_key": "provided-pdf-20261004-09", "plan": "plus", "title": "두번째 이용합니다", "author_masked": "최O경", "rating": 5, "published_on": "2026-09-20", "content": "지난번에 어머니 진료 때문에 처음 이용했는데 만족해서 이번에도 신청했습니다. 이번에는 검사도 같이 있어서 시간이 조금 오래 걸렸는데 끝까지 잘 챙겨주셨어요. 어머니도 지난번에 이용했던 게 편하셨는지 이번에는 걱정을 덜 하시더라고요. 다음 병원 일정에도 필요하면 이용할 것 같습니다."}, {"id": "00000175-0000-4000-8000-000000000008", "source_key": "provided-pdf-20261004-08", "plan": "basic", "title": "내시경 동행", "author_masked": "정O주", "rating": 4, "published_on": "2026-09-16", "content": "아버지가 수면내시경을 받으셔야 하는데 보호자가 필요하다고 해서 이용했습니다. 평일이라 가족들이 시간을 내기가 어려웠는데 검사 전부터 끝날 때까지 같이 있어주셨어요. 검사 후 회복하실 때도 옆에서 챙겨주시고 귀가하실 때까지 도와주셔서 감사했습니다. 처음 이용이라 걱정했는데 잘 마무리했습니다."}, {"id": "00000175-0000-4000-8000-000000000007", "source_key": "provided-pdf-20261004-07", "plan": "plus", "title": "아버지 진료 잘 다녀오셨습니다", "author_masked": "김O정", "rating": 5, "published_on": "2026-09-12", "content": "부모님과 떨어져 살고 있어서 아버지 병원 예약이 잡힐 때마다 걱정이 많았습니다. 이번에는 제가 내려갈 수 없는 상황이라 처음 신청해봤어요. 병원에서 어디로 가야 하는지부터 접수, 진료, 수납까지 같이 해주셨고 중간에 상황도 알려주셨습니다. 아버지도 친절하게 잘해주셨다고 하네요."}, {"id": "00000175-0000-4000-8000-000000000006", "source_key": "provided-pdf-20261004-06", "plan": "basic", "title": "처음 이용해봤어요", "author_masked": "윤O영", "rating": 5, "published_on": "2026-09-08", "content": "이런 서비스가 있는 건 알고 있었는데 부모님을 처음 보는 분께 부탁드리는 게 조금 걱정돼서 계속 고민했습니다. 그래도 파트너 정보를 보고 선택할 수 있어서 신청해봤어요. 실제로 이용해보니 어머니도 편했다고 하시고 친절하게 잘 챙겨주셨다고 해서 다행이었습니다. 다음에는 조금 더 편하게 신청할 수 있을 것 같아요."}, {"id": "00000175-0000-4000-8000-000000000005", "source_key": "provided-pdf-20261004-05", "plan": "plus", "title": "항암 진료 동행 감사합니다", "author_masked": "한O숙", "rating": 5, "published_on": "2026-09-05", "content": "어머니가 정기적으로 병원에 다니시는데 매번 제가 같이 가기가 어려워 이번에 처음 부탁드렸습니다. 접수부터 대기, 진료까지 함께해주시고 끝난 뒤에는 어떻게 진행됐는지도 알려주셨어요. 멀리 떨어져 있어서 병원 가시는 날마다 마음에 걸렸는데 이런 서비스가 있어서 도움이 많이 됐습니다."}, {"id": "00000175-0000-4000-8000-000000000004", "source_key": "provided-pdf-20261004-04", "plan": "basic", "title": "부모님 병원 갈 때 이용했습니다", "author_masked": "오O현", "rating": 4, "published_on": "2026-09-02", "content": "저희 가족 모두 직장을 다녀서 평일 병원 일정이 생길 때마다 누가 같이 갈지 정하는 게 일이었습니다. 이번에는 일정이 도저히 맞지 않아서 이용하게 됐는데 생각보다 편했어요. 부모님도 혼자 가시는 것보다 옆에서 같이 챙겨주는 사람이 있으니까 훨씬 낫다고 하셨습니다. 필요할 때 이용하기 괜찮은 것 같아요."}, {"id": "00000175-0000-4000-8000-000000000003", "source_key": "provided-pdf-20261004-03", "plan": "plus", "title": "친절하게 잘 해주셨어요", "author_masked": "임O연", "rating": 5, "published_on": "2026-08-30", "content": "아버지가 낯선 분과 같이 다니는 걸 불편해하실까 봐 걱정했는데 괜한 걱정이었네요. 천천히 걸어주시고 대기하는 동안에도 편하게 대해주셨다고 합니다. 아버지가 먼저 다음에도 병원 갈 때 같은 분과 같이 가면 좋겠다고 하셨어요. 잘 부탁드려서 다행입니다."}, {"id": "00000175-0000-4000-8000-000000000002", "source_key": "provided-pdf-20261004-02", "plan": "basic", "title": "진료 내용도 알려주셔서 좋았습니다", "author_masked": "조O경", "rating": 5, "published_on": "2026-08-27", "content": "제가 같이 가지 못해서 가장 걱정됐던 게 부모님이 의사 선생님 설명을 제대로 기억하실 수 있을까 하는 부분이었습니다. 진료가 끝난 후 어떻게 진행됐는지 확인할 수 있게 알려주셔서 좋았어요. 단순히 병원에 같이 가주는 것뿐 아니라 보호자가 상황을 알 수 있다는 점이 특히 도움이 됐습니다."}, {"id": "00000175-0000-4000-8000-000000000001", "source_key": "provided-pdf-20261004-01", "plan": "plus", "title": "어머니 병원 동행 부탁드렸어요", "author_masked": "이O민", "rating": 5, "published_on": "2026-08-25", "content": "어머니가 혼자 병원에 가시는 건 가능하지만 큰 병원이라 접수하고 검사실을 찾아다니는 게 걱정돼서 신청했습니다. 제가 회사 때문에 같이 갈 수가 없었는데 예약시간에 맞춰 만나서 접수부터 진료까지 잘 챙겨주셨어요. 끝나고 어떻게 진행됐는지도 알려주셔서 마음이 놓였습니다. 감사합니다."}]$reviews$::jsonb) as r(
  id uuid, source_key text, plan text, title text, content text,
  author_masked text, rating smallint, published_on date
)
on conflict (source_key) do nothing;
