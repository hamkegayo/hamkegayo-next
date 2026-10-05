-- #175 사용자 확인 2026-10-05: 제공 후기 12건 모두 실제 이용자 본인 공개 동의,
-- 공통 동의일 2026-10-04, 공개 기간 3년. 구체 진료 표현 일반화본은 그대로 사용.
-- 확인 출처는 작업 대화이며, 서명 동의서·확인 관리자 계정을 임의 생성하지 않는다.
alter table public.review_publication_consents
 add column verification_method text not null default 'ADMIN_REVIEW'
  check(verification_method in ('ADMIN_REVIEW','PROJECT_OWNER_CONFIRMATION')),
 add column verifier_reference text,
 add column consent_time_precision text not null default 'TIMESTAMP'
  check(consent_time_precision in ('TIMESTAMP','DATE'));
alter table public.review_publication_consents alter column verified_by drop not null;
alter table public.review_publication_consents add constraint review_consent_verifier_required check (
 (verification_method='ADMIN_REVIEW' and verified_by is not null)
 or (verification_method='PROJECT_OWNER_CONFIRMATION' and verified_by is null and coalesce(length(trim(verifier_reference)),0)>=5)
);

do $$
declare r record; consent uuid;
 wording text := $wording$함께가요 웹사이트에서 동행 경험을 안내하고 이용자가 파트너 선택에 참고하도록 후기를 공개합니다.

실제 서비스 이용자가 별도로 동의해야 합니다. 예약자가 다른 경우 예약자의 동의만으로 공개하지 않으며, 실제 이용자 본인의 동의 또는 확인된 대리권과 대리 동의를 확인합니다.

공개할 후기 제목·본문·마스킹된 작성자명·별점·상품명·게시일과, 동의서에 구체적으로 기재하고 선택한 진료·검사 종류만 공개합니다. 다른 진료 내용, 질환명, 실명, 연락처와 동의 증빙은 공개하지 않습니다.

로그인하지 않은 방문자를 포함한 웹사이트 이용자에게 후기 목록·상세, 메인 후기 카드 및 예약 단계의 파트너 상세에서 공개됩니다. 공개 정보는 검색·복사될 수 있습니다.

동의한 날부터 3년간 공개하며, 기간이 끝나면 공개를 중단합니다. 계속 공개하려면 별도로 다시 동의해야 합니다. 그 전에 철회하면 즉시 공개를 중단합니다.

후기 식별번호를 적어 개인정보 보호책임자에게 이메일 또는 카카오톡으로 철회를 요청할 수 있습니다. 본인 또는 대리권 확인 후 해당 공개를 중단합니다. 이미 외부에서 복사한 내용이나 검색 서비스의 캐시는 직접 삭제를 보장할 수 없어 필요한 삭제 요청을 안내합니다.

후기 공개 동의와 진료·검사 정보 공개 동의는 선택 사항이며 서비스 제공 동의와 별도로 받습니다. 동의하지 않거나 철회해도 예약·결제·동행 서비스 이용에 불이익이 없습니다.$wording$;
begin
 if (select count(*) from public.imported_reviews where source_key like 'provided-pdf-20261004-%')<>12 then
  raise exception 'expected_twelve_provided_reviews';
 end if;
 for r in select * from public.imported_reviews where source_key like 'provided-pdf-20261004-%' order by source_key loop
  -- 다른 승인본·철회 이력이 있으면 자동 덮어쓰기/재게시하지 않는다.
  if exists(select 1 from public.review_publications where source='provided' and review_id=r.id)
    or exists(select 1 from public.review_publication_consents where source='provided' and review_id=r.id) then continue; end if;
  if (r.title||r.content) ~ '(항암|내시경|수면검사)' then raise exception 'specific_health_text_requires_separate_release'; end if;
  insert into public.review_publication_consents(source,review_id,subject_reference,consenting_party,
   evidence_reference,wording_version,wording_snapshot,consented_at,expires_at,allowed_items,
   verified_by,verification_method,verifier_reference,consent_time_precision)
  values('provided',r.id,'제공 후기 실제 이용자:'||r.source_key,'ACTUAL_RECIPIENT',
   '#175 작업 대화 2026-10-05: 제공자 본인 동의 확인','review-publication-2026-10-04-v1',wording,
   '2026-10-04T00:00:00+09:00','2029-10-04T00:00:00+09:00','["후기 공개본"]',
   null,'PROJECT_OWNER_CONFIRMATION','#175 작업 요청자 확인: 12건 본인 동의 및 2026-10-04 동의일','DATE') returning id into consent;
  insert into public.review_publications(source,review_id,consent_id,title,content,contains_health_information)
  values('provided',r.id,consent,r.title,r.content,false);
  update public.imported_reviews set published=true where id=r.id;
 end loop;
end $$;
