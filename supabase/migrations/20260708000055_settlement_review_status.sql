-- #56 관리자 정산 검토 상태.
-- enum 값 추가와 새 값을 사용하는 함수를 같은 트랜잭션에서 실행하지 않도록 분리한다.

alter type public.settlement_status add value if not exists 'HOLD';
alter type public.settlement_status add value if not exists 'APPROVED';
