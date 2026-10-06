-- #199 사용자 활성화 결정(2026-10-05). 고지 페이지(/partner-evidence-notice)를 먼저 배포한 뒤 적용한다.
-- 개인정보처리방침 정본(Notion) 반영은 사용자가 별도로 요청한다. 30일 보유·이의신청·파기는 85에 있다.
-- 고객 상세 공개(partner_public_release)와 후기 건강정보 공개는 변경하지 않는다.
update public.partner_evidence_release set enabled=true where id;
