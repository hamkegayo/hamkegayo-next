-- #257 개인정보처리방침 인용 보강 (Notion 원문 2026-09-10 확인).
-- 제5조 ② [단계 1]·④: 거동·인지 상태 등 최소 건강정보는 별도 동의로 수락 검토 시 제공.
-- 제5조 ② [단계 2]·제9조 ④: 수행기록 제출 완료 시까지, 최대 종료 후 24시간 접근.
-- 적용된 마이그레이션 22는 보존한다. 컬럼 설명만 바꾸며 동작·권한·RLS는 변경하지 않는다.
-- https://www.notion.so/3cf169f76f9f81d988f6ec4c2b29565b

comment on column public.reservations.mobility_status is
  '거동상태(민감정보). 수락 검토용 최소 건강정보 — 처리방침 제5조 ② [단계 1]·④에 따라 별도 동의로 제공.';

comment on column public.reservations.cognitive_status is
  '인지상태(민감정보). 수락 검토용 최소 건강정보 — 처리방침 제5조 ② [단계 1]·④에 따라 별도 동의로 제공.';
