-- =============================================================
-- 귀책 보상 회수액 — 지급 이후 사용분 기준 (#250, PR #252 리뷰)
--
--  94 의 회수액은 min(지급액, 고객 전체 잔액) 이었다. 원장은 잔액 합계라
--  기존 적립분·다른 보상분까지 이 보상의 회수 대상으로 잡혔다.
--   예) 적립 10,000P + 보상 5,000P → 5,000P 사용 → 회수 시 5,000P 를 가져가 적립분이 준다.
--
--  사용자 결정 2026-10-07 "이미 사용된 만큼은 회수하지 않는다" 를 지급 건 단위로 적용한다.
--   - 지급 이후의 사용(USE)은 이 보상분에서 먼저 쓴 것으로 본다.
--   - 회수액 = min(지급액 - 지급 이후 사용액, 현재 잔액), 0 미만이면 0.
--   - 기존 적립분·다른 보상분은 줄지 않는다.
--   - 사용 취소(USE_CANCEL) 복원은 되돌려 넣지 않는다(고객 유리 쪽으로 둔다).
--
--  94 는 스테이징에 이미 적용되어 있어 함수만 이 파일에서 교체한다.
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

create or replace function public.admin_revoke_compensation(p_id uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c       public.point_compensations;
  v_balance integer;
  v_used    integer;
  v_amount  integer;
  v_point   uuid;
begin
  if not public.can_manage_settlements() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select * into v_c from public.point_compensations where id = p_id for update;
  if not found then
    raise exception 'compensation_not_found' using errcode = 'P0002';
  end if;
  if v_c.revoked_at is not null then
    raise exception 'already_revoked' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_c.customer_id::text, 0));
  select coalesce(-sum(p.amount), 0)::integer into v_used
    from public.points p
    join public.points g on g.id = v_c.point_id
   where p.user_id = v_c.customer_id
     and p.reason = 'USE'::public.point_reason
     and p.created_at > g.created_at;
  v_balance := greatest(public.point_balance(v_c.customer_id), 0);
  v_amount := least(greatest(v_c.amount - v_used, 0), v_balance);

  if v_amount > 0 then
    insert into public.points (user_id, amount, reason, reservation_id, memo)
    values (v_c.customer_id, -v_amount, 'COMPENSATION'::public.point_reason, v_c.reservation_id, '보상 회수')
    returning id into v_point;
  end if;

  update public.point_compensations
     set revoked_amount = v_amount, revoke_point_id = v_point, revoke_reason = trim(p_reason),
         revoked_by = auth.uid(), revoked_at = now()
   where id = p_id;

  if v_amount > 0 then
    insert into public.notifications (recipient_id, type, title, body, link, dedupe_key)
    values (v_c.customer_id, 'POINT_COMPENSATED', '보상 포인트 지급이 정정되었어요',
            format('예약 %s 보상 포인트 중 %sP가 정정되었어요. 문의는 고객센터로 연락해 주세요.',
                   v_c.reservation_code, to_char(v_amount, 'FM999,999,999')),
            '/mypage/points', 'point-compensation-revoke:' || p_id::text)
    on conflict (recipient_id, dedupe_key) do nothing;
  end if;

  perform public.log_access('COMPENSATION_REVOKE', 'point_compensations', p_id, v_c.customer_id,
                            trim(p_reason));
  return v_amount;
end;
$$;

comment on function public.admin_revoke_compensation(uuid, text) is
  '보상 지급 1건을 회수한다. 지급 이후 사용분은 이 보상에서 쓴 것으로 보고 남은 만큼만 음수 행으로 회수. 1회만.';

revoke all on function public.admin_revoke_compensation(uuid, text) from public, anon;
grant execute on function public.admin_revoke_compensation(uuid, text) to authenticated;
