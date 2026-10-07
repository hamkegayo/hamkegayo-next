-- =============================================================
-- 서비스 진행 메모 임시 저장 — #268
--
--  파트너 서비스 상세의 "임시 저장" 버튼이 토스트만 띄우고 저장하지 않았다. 메모는 시작·종료 RPC
--  (start_service / end_service)에서만 저장되어, 그 뒤 고친 내용은 새로고침하면 사라졌다.
--  메모 열만 갱신하는 RPC 를 둔다. 서비스 시각·상태는 건드리지 않는다.
--
--  조건
--   - 담당 파트너 본인, 열람 제한 기간 안(partner_can_access — 처리방침 제5조 ② [단계 2]·제9조 ④)
--   - 시작 메모(START) : 어느 단계에서나(시작 전 작성 중인 메모도 남긴다)
--   - 종료 메모(END)   : 서비스 시작 후(IN_PROGRESS·ENDED·COMPLETED)
--   - 1000자 이하. 빈 값은 NULL 로 저장
--   - 보유기간 파기(sensitive_data_purged_at)된 서비스는 쓰지 않는다 — 파기된 메모를 되살리지 않는다(처리방침 제4조)
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

create or replace function public.save_service_memo(
  p_service_id uuid,
  p_kind       text,
  p_memo       text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_svc  public.services;
  v_memo text := nullif(btrim(coalesce(p_memo, '')), '');
begin
  if p_kind is null or p_kind not in ('START', 'END') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  if v_memo is not null and char_length(v_memo) > 1000 then
    raise exception 'memo_too_long' using errcode = '22023';
  end if;

  select * into v_svc from public.services where id = p_service_id for update;
  if not found then
    raise exception 'service_not_found' using errcode = 'P0002';
  end if;
  if v_svc.partner_id is distinct from auth.uid() then
    raise exception 'not_partner' using errcode = '42501';
  end if;
  if not public.partner_can_access(v_svc.reservation_id) then
    raise exception 'access_expired' using errcode = '42501';
  end if;
  if v_svc.sensitive_data_purged_at is not null then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  if p_kind = 'START' then
    update public.services set start_memo = v_memo where id = p_service_id;
  else
    if v_svc.status = 'SCHEDULED'::public.service_status then
      raise exception 'invalid_state' using errcode = 'P0001';
    end if;
    update public.services set end_memo = v_memo where id = p_service_id;
  end if;
end;
$$;

comment on function public.save_service_memo(uuid, text, text) is
  '파트너 서비스 메모 임시 저장(#268). 담당 파트너·열람 제한 기간 안에서만, 메모 열만 갱신.';

revoke all on function public.save_service_memo(uuid, text, text) from public, anon;
grant execute on function public.save_service_memo(uuid, text, text) to authenticated;
