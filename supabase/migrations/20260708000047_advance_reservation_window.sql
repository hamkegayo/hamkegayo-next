-- =============================================================
-- PG 심사 보완 — 결제일 포함 60일 이내 예약만 확정
--
-- 화면과 API 검증을 우회해도 결제 확정 트랜잭션에서 마지막으로 차단한다.
-- 결제일은 KST 기준 1일째이므로 이용일의 상한은 결제일 + 59일이다.
-- =============================================================
create or replace function public.confirm_reservation_payment(
  p_reservation_id uuid,
  p_payment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner  uuid;
  v_status   public.reservation_status;
  v_deadline timestamptz;
  v_use_date date;
  v_paid     boolean;
  v_paid_at  timestamptz;
begin
  select confirmed_partner_id, status, payment_deadline, use_date
    into v_partner, v_status, v_deadline, v_use_date
    from public.reservations
   where id = p_reservation_id
   for update;

  if not found then raise exception 'reservation_not_found'; end if;
  if v_partner is null then raise exception 'partner_not_selected'; end if;
  if v_status <> 'MATCHING'::public.reservation_status then raise exception 'not_matching'; end if;
  if v_deadline is not null and v_deadline <= now() then raise exception 'payment_expired'; end if;

  select status = 'PAID'::public.payment_status, paid_at
    into v_paid, v_paid_at
    from public.payments
   where id = p_payment_id
     and reservation_id = p_reservation_id
     and type = 'BASE'::public.payment_type;

  if v_paid is not true then raise exception 'payment_not_paid'; end if;

  if v_use_date >
     ((coalesce(v_paid_at, now()) at time zone 'Asia/Seoul')::date + 59)
  then
    raise exception 'reservation_date_out_of_range';
  end if;

  update public.reservations
     set status = 'CONFIRMED'::public.reservation_status,
         payment_deadline = null
   where id = p_reservation_id;

  update public.reservation_applications
     set status = 'NOT_SELECTED'::public.application_status
   where reservation_id = p_reservation_id
     and partner_id <> v_partner
     and status = 'ACCEPTED'::public.application_status;
end;
$$;

comment on function public.confirm_reservation_payment(uuid, uuid) is
  '결제일(KST)을 1일째로 계산해 60일 이내의 선결제만 예약을 확정한다. 서버 전용.';

revoke all on function public.confirm_reservation_payment(uuid, uuid)
  from public, anon, authenticated;
