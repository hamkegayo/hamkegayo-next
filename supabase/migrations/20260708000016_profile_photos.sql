-- =============================================================
-- 프로필 사진 (USER/PARTNER 공용) — #57
--  - profiles.avatar_path : profile-photos 버킷의 object 경로
--  - 버킷은 비공개. 고객 노출은 서버가 발급한 signed URL 로만 이뤄진다.
--    (public 버킷은 비로그인 크롤링에 얼굴 사진이 그대로 노출되므로 사용하지 않음)
--  - 사전 심사 없이 업로드 즉시 노출(MVP). 신고/차단은 후속 이슈.
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

alter table public.profiles
  add column if not exists avatar_path text;

comment on column public.profiles.avatar_path is
  '프로필 사진 object 경로({uid}/{uuid}.jpg). 버킷: profile-photos(비공개). 미등록 시 null.';

-- =============================================================
-- Storage: 비공개 버킷 + objects RLS (경로 {uid}/{uuid}.{ext})
--  - 2MB / JPEG·PNG 만 허용 (자격증·리포트와 달리 PDF 제외)
--  - insert·select·delete 모두 본인 폴더만.
--    고객에게 보여줄 URL 은 service_role 이 서버에서 signed URL 로 발급한다.
-- =============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos', 'profile-photos', false, 2097152,
  array['image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile_photo_insert_own" on storage.objects;
create policy "profile_photo_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile_photo_select_own" on storage.objects;
create policy "profile_photo_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile_photo_delete_own" on storage.objects;
create policy "profile_photo_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
