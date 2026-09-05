-- =============================================================
-- 독촉 중단과 관리자 이관 (#75) — 2026-09-05 리뷰
--
--  독촉에 종료 조건이 없었다. 결제하거나 취소될 때까지 매일 나간다.
--  받는 사람은 스팸으로 신고하고, 그 신고가 쌓이면 **발신 도메인 평판이
--  떨어져 인증 메일까지 스팸함으로 간다.** 회수하려다 가입을 막는 셈이다.
--
--  7회를 보내고 멈춘다. 그 뒤로는 사람이 연락한다 — 7번 무시한 사람에게
--  8번째 메일이 통할 이유가 없다.
--
--  ⚠️ 이관은 **독촉만** 멈춘다. 미납 상태와 신규 예약 제한(약관 제22조 ③)은
--     그대로 유지된다. 돈을 안 받기로 한 것이 아니다.
-- =============================================================

alter table public.payments
  add column if not exists collection_state text not null default 'ACTIVE';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.payments'::regclass
       and conname = 'payments_collection_state_check'
  ) then
    alter table public.payments add constraint payments_collection_state_check
      check (collection_state in ('ACTIVE', 'UNPAID_EXPIRED'));
  end if;
end;
$$;

comment on column public.payments.collection_state is
  '독촉 상태. ACTIVE = 자동 독촉 중 / UNPAID_EXPIRED = 7회 발송 후 관리자 이관. 미납 자체는 해소되지 않는다.';

-- =============================================================
-- 독촉 대상 — 상한을 넘긴 건은 빼고, 마지막 회차에서 이관한다
--
--  반환 열이 늘어 create or replace 로는 못 바꾼다. 먼저 지운다.
-- =============================================================
drop function if exists public.claim_extension_reminders(integer);

create function public.claim_extension_reminders(p_limit integer default 100)
returns table (
  payment_id  uuid,
  customer_id uuid,
  amount      integer,
  code        text,
  use_date    date,
  pay_token   text,
  overdue     boolean,
  /** 이번 발송이 마지막이라 관리자에게 넘겼다 */
  handed_over boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- 7회. 스팸 신고가 쌓이기 전에 멈추는 선이다(2026-09-05 리뷰).
  v_max constant integer := 7;
begin
  return query
  with target as (
    select p.id
      from public.payments p
     where p.type = 'EXTENSION'::public.payment_type
       and p.status = 'PENDING'::public.payment_status
       and p.link_sent_at is not null
       and p.collection_state = 'ACTIVE'
       and p.reminder_count < v_max
       -- 발송 당일에는 다시 보내지 않는다.
       and p.link_sent_at < now() - interval '20 hours'
       and (p.reminded_at is null or p.reminded_at < now() - interval '20 hours')
     order by p.created_at
     limit greatest(1, p_limit)
  ), claimed as (
    update public.payments p
       set reminded_at = now(),
           reminder_count = p.reminder_count + 1,
           -- 이번이 마지막 회차면 곧바로 이관한다. 다음 배치에서 다시
           -- 훑어 갱신하면 그 사이에 한 번 더 나갈 수 있다.
           collection_state = case
             when p.reminder_count + 1 >= v_max then 'UNPAID_EXPIRED'
             else p.collection_state
           end
      from target t
     where p.id = t.id
    returning p.id, p.reservation_id, p.gross_amount, p.pay_token,
              p.token_expires_at, p.collection_state
  )
  select c.id,
         r.customer_id,
         c.gross_amount,
         r.code,
         r.use_date,
         c.pay_token,
         (c.token_expires_at is not null and c.token_expires_at <= now()),
         (c.collection_state = 'UNPAID_EXPIRED')
    from claimed c
    join public.reservations r on r.id = c.reservation_id;
end;
$$;

comment on function public.claim_extension_reminders(integer) is
  '독촉 대상을 가져가면서 reminded_at 과 회차를 갱신한다. 7회를 채우면 UNPAID_EXPIRED 로 이관하고 이후 자동 독촉에서 제외한다. 서버 전용.';

revoke all on function public.claim_extension_reminders(integer)
  from public, anon, authenticated;

-- =============================================================
-- 관리자 미수 목록에 독촉 상태를 함께 보여 준다
-- =============================================================
drop function if exists public.admin_list_unpaid_charges();

create function public.admin_list_unpaid_charges()
returns table (
  payment_id  uuid,
  amount      integer,
  code        text,
  use_date    date,
  charge_reason text,
  link_sent_at timestamptz,
  expires_at  timestamptz,
  reminder_count integer,
  collection_state text,
  review_required boolean,
  overdue     boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select p.id, p.gross_amount, r.code, r.use_date, p.charge_reason,
         p.link_sent_at, p.token_expires_at, p.reminder_count,
         p.collection_state, p.review_required,
         (p.token_expires_at is not null and p.token_expires_at <= now())
    from public.payments p
    join public.reservations r on r.id = p.reservation_id
   where p.type = 'EXTENSION'::public.payment_type
     and p.status = 'PENDING'::public.payment_status
   -- 이관된 건이 먼저 보여야 한다. 사람이 손대야 하는 건들이다.
   order by (p.collection_state = 'UNPAID_EXPIRED') desc, p.created_at;
end;
$$;

comment on function public.admin_list_unpaid_charges() is
  '미결제 추가결제 목록(관리자). 관리자 이관 건이 먼저 오고, 소프트 상한 검토 대기 건도 함께 보인다.';

revoke all on function public.admin_list_unpaid_charges() from public, anon;
grant execute on function public.admin_list_unpaid_charges() to authenticated;
