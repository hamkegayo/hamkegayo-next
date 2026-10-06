-- #226 사용자 결정(2026-10-06): 파트너 활동 정보 고객 공개와 생년월일 본인확인 접수를 연다.
-- 처리방침 제1조·제2조·제4조와 공개 고지 v2는 Notion 외 서류에 반영되어 승인 처리됐다.
-- 적용 순서: 고지 v2 문구(#234)와 본인확인 화면(#235)이 운영에 배포된 것을 확인한 뒤 적용한다.
--  - partner_activity_release: v2 동의자의 활동 정보만 고객 상세에 공개된다. v1 동의자는 재동의 전까지 기존 항목만 공개된다.
--  - partner_identity_release: 파트너가 생년월일을 제출할 수 있다. 확인·반려 즉시, 미처리는 30일 뒤 파기된다.
update public.partner_activity_release set enabled = true where id;
update public.partner_identity_release set enabled = true where id;
