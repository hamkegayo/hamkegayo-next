-- =============================================================
-- 알림 중복 방지 키 (#91)
--
--  왜 필요한가
--    createNotification() 은 무조건 insert 한다. 예약 확정·도착 통보처럼
--    "사건이 일어난 순간" 한 번 부르는 알림은 그래도 된다.
--
--    그런데 약관 재동의 안내는 사건이 아니라 **상태**다. "이 사람의 최신
--    동의 버전이 현행본보다 낮다" 는 조건은 재동의할 때까지 계속 참이다.
--    배치가 하루 한 번 돌면 같은 안내가 날마다 쌓인다.
--
--  그래서 상태형 알림에만 키를 붙인다. 키가 있으면 같은 수신자에게 두 번
--  들어가지 않는다. 키가 없는 기존 알림은 지금처럼 계속 쌓인다 —
--  Postgres 는 유니크 인덱스에서 null 을 서로 다른 값으로 보기 때문이다.
--
--  ⚠️ **부분 인덱스(where dedupe_key is not null)로 두면 안 된다.**
--     ON CONFLICT 의 대상 인덱스는 술어까지 추론돼야 하는데 PostgREST 는
--     그 술어를 실어 보낼 수 없다. 그래서 upsert 가 조용히 0건이 된다
--     (스테이징에서 실제로 확인했다).
--
--  키 형식은 호출부가 정한다. 재동의는 아래를 쓴다.
--    AGREEMENT_REVISED:<agreement_type>:<version>
--    예) AGREEMENT_REVISED:PRIVACY:2026-09-06
--  버전이 바뀌면 키도 바뀌므로 **다음 개정 때는 다시 한 번 나간다.**
-- =============================================================

alter table public.notifications
  add column if not exists dedupe_key text;

comment on column public.notifications.dedupe_key is
  '상태형 알림의 중복 방지 키. null 이면 중복 검사를 하지 않는다(사건형 알림).';

drop index if exists idx_notifications_dedupe;
create unique index idx_notifications_dedupe
  on public.notifications (recipient_id, dedupe_key);
