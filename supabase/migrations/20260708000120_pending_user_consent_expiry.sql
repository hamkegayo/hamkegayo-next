-- =============================================================
-- 이용자 본인 동의 대기(PENDING_USER) 예약의 서비스 시각 경과 정리 (#310)
--
--  #306(마이그레이션 119) 이후 관계가 '본인' 이 아닌 USER_DIRECT 예약은
--  PENDING_USER 로 시작하고, 이용자 본인이 동의하기 전에는 파트너 노출·결제가 막힌다.
--
--  기존 expire_past_matchings(마이그레이션 111)는 이미 이 예약도 시작 예정시각이
--  지나면 CANCELLED 로 바꾼다. 다만 사유가 EXPIRED 로 남고 보호자에게
--  "파트너가 정해지지 않은 채…" 라고 안내해, 실제 원인(본인 미동의)과 다르다.
--
--  결정(2026-11-19)
--    · 처리: 새 상태를 만들지 않고 CANCELLED 유지 + 사유 USER_CONSENT_EXPIRED 로 구분
--    · 시점: 기존과 같은 서비스 시작 예정시각(reservation_start_at) 기준
--    · 안내: 예약자(보호자)에게 전용 문구로 알린다
--    · 미사용 동의 토큰은 같은 시점에 폐기(revoked_at)한다
--
--  근거
--    · 처리방침 제10조 ①② — 본인 동의가 원칙이고 동의 확인 절차를 운영한다. 동의 없이는 진행하지 않는다.
--    · 약관 제9조 ④⑦ — 선결제 완료 시점에 확정되며, 그 전에는 확정되지 않는다. PENDING_USER 는
--      결제·확정이 막혀(trg_guard_pending_user_consent_matching) 제19조 취소수수료·환불 대상이 없다.
--    · 약관 제26조 ① — 취소 사실은 서비스 내 알림으로 통지한다.
--    · 처리방침 제4조 — 보유기간은 기존 예약 파기 기준(run_retention_purge)을 그대로 따른다.
--  동의 증거(user_consent_*, proxy_*)는 바꾸지 않는다. 상태·취소 사유·취소 시각만 바뀐다.
--
--  ⚠️ 함수 본문과 사유 체크 제약만 바뀐다. 스케줄(expiry-sweep)·진입점(run_expiry_sweep)은 그대로다.
-- =============================================================

alter table public.reservations
  drop constraint if exists reservations_cancel_reason_chk;
alter table public.reservations
  add constraint reservations_cancel_reason_chk
  check (cancel_reason is null
         or cancel_reason in ('EXPIRED', 'USER_CONSENT_EXPIRED', 'USER', 'REFUND', 'ADMIN'));

comment on column public.reservations.cancel_reason is
  '취소 사유. EXPIRED(자동 만료) / USER_CONSENT_EXPIRED(이용자 본인 동의 없이 시작 시각 경과, #310) / USER(본인 취소) / REFUND(환불) / ADMIN(운영센터). null 은 취소되지 않았거나 기록 이전의 건이다.';

create or replace function public.expire_past_matchings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  with expired as (
    update public.reservations
       set status = 'CANCELLED',
           cancel_reason = case
             when user_consent_status = 'PENDING_USER' then 'USER_CONSENT_EXPIRED'
             else 'EXPIRED'
           end,
           cancelled_at = now()
     where status = 'MATCHING'
       and arrive_time ~ '\d'
       and public.reservation_start_at(use_date, arrive_time) < now()
       and not (matching_mode = 'admin_direct' and paid_at is not null)
       -- 승인 진행 중(PENDING 결제)이면 건드리지 않는다 — 승인 직후 매칭 대기로 가야 한다
       and not (matching_mode = 'admin_direct'
                and exists (select 1 from public.payments p
                             where p.reservation_id = reservations.id
                               and p.type = 'BASE' and p.status = 'PENDING'
                               and p.created_at > now() - interval '30 minutes'))
    returning id, customer_id, cancel_reason
  ), revoked as (
    -- 취소된 예약의 동의 링크는 더 쓸 수 없다. 토큰 상태 조회도 CLOSED 로 막히지만 흔적을 남긴다.
    update public.reservation_consent_tokens t
       set revoked_at = now()
      from expired e
     where t.reservation_id = e.id
       and e.cancel_reason = 'USER_CONSENT_EXPIRED'
       and t.used_at is null
       and t.revoked_at is null
    returning 1
  ), notified as (
    insert into public.notifications (recipient_id, type, title, body, link)
    select e.customer_id,
           'RESERVATION_CANCELLED',
           case when e.cancel_reason = 'USER_CONSENT_EXPIRED'
                then '이용자 본인 동의가 없어 예약이 취소되었어요'
                else '서비스 시작 시각이 지나 예약이 취소되었어요'
           end,
           case when e.cancel_reason = 'USER_CONSENT_EXPIRED'
                then '서비스 시작 예정시각까지 이용자 본인의 동의가 완료되지 않아 예약이 자동으로 취소되었습니다. 결제 전 예약이라 청구된 금액은 없습니다.'
                else '파트너가 정해지지 않은 채 서비스 시작 예정시각이 지나 예약이 자동으로 취소되었습니다.'
           end,
           '/mypage/reservations/' || e.id::text
      from expired e
    returning 1
  )
  select count(*)::integer into affected from expired;

  return affected;
end;
$$;

comment on function public.expire_past_matchings() is
  '파트너 미정(결제 전) 상태로 서비스 시작 예정시각(arrive_time)이 지난 매칭을 취소하고 이용자에게 알린다. 본인 동의 대기(PENDING_USER) 건은 USER_CONSENT_EXPIRED 로 구분하고 미사용 동의 토큰을 폐기한다 (#310).';
