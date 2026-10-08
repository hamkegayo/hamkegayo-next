-- #278. 기존 활동 정보 검증을 재사용하고 자기소개와 같은 트랜잭션에서 저장한다.
create function public.save_partner_profile(p_intro text, p_activity jsonb default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_intro is null or length(p_intro)>300 then raise exception 'invalid_intro' using errcode='22023'; end if;
  perform 1 from public.partner_accounts a join public.profiles p on p.id=a.profile_id
    where a.profile_id=auth.uid() and p.role='PARTNER' and p.status='ACTIVE' for update of a;
  if not found then raise exception 'forbidden' using errcode='42501'; end if;
  if p_activity is not null then
    perform public.save_partner_activity_profile(
      array(select jsonb_array_elements_text(p_activity->'regions')),
      (p_activity->'times'->'weekday'->>0)::time, (p_activity->'times'->'weekday'->>1)::time,
      (p_activity->'times'->'saturday'->>0)::time, (p_activity->'times'->'saturday'->>1)::time,
      (p_activity->'times'->'holiday'->>0)::time, (p_activity->'times'->'holiday'->>1)::time,
      array(select jsonb_array_elements_text(p_activity->'transports')),
      array(select jsonb_array_elements_text(p_activity->'mobility')),
      array(select jsonb_array_elements_text(p_activity->'hospitals')));
  end if;
  update public.partner_accounts set intro=p_intro where profile_id=auth.uid();
end $$;
revoke all on function public.save_partner_profile(text,jsonb) from public,anon;
grant execute on function public.save_partner_profile(text,jsonb) to authenticated;

-- 처리방침 파트너 증빙: 심사 결과 통지 후 30일 보유, 이의신청 처리 중 파기 보류.
-- 미심사 등록만 직접 취소한다. 심사·통지된 자료는 기존 이의신청/운영센터 절차로 처리한다.
-- 원문: https://www.notion.so/3cf169f76f9f81d988f6ec4c2b29565b
create function public.guard_partner_evidence_withdraw() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- SECURITY DEFINER 내부 current_user 대신 실제 요청 역할을 확인한다.
  -- 서버 정리·테스트 fixture 정리에는 이전 JWT 설정이 남아 있어도 영향 주지 않는다.
  if current_setting('role',true)='authenticated' and (
    old.partner_id is distinct from auth.uid() or old.status<>'PENDING'
    or exists(select 1 from public.partner_evidence_retention r where r.item_id=old.id
      and r.kind=case when tg_table_name='partner_qualifications' then 'QUALIFICATION' else 'HISTORY' end)
  ) then raise exception 'evidence_retention_required' using errcode='42501'; end if;
  return old;
end $$;
revoke all on function public.guard_partner_evidence_withdraw() from public,anon,authenticated;
create trigger qualification_withdraw_guard before delete on public.partner_qualifications
  for each row execute function public.guard_partner_evidence_withdraw();
create trigger history_withdraw_guard before delete on public.partner_work_histories
  for each row execute function public.guard_partner_evidence_withdraw();

create function public.withdraw_partner_evidence(p_id uuid,p_kind text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_kind='QUALIFICATION' then
    perform 1 from public.partner_qualifications where id=p_id and partner_id=auth.uid() for update;
    if not found then raise exception 'not_found' using errcode='42501'; end if;
    delete from public.partner_qualifications where id=p_id and partner_id=auth.uid();
  elsif p_kind='HISTORY' then
    perform 1 from public.partner_work_histories where id=p_id and partner_id=auth.uid() for update;
    if not found then raise exception 'not_found' using errcode='42501'; end if;
    delete from public.partner_work_histories where id=p_id and partner_id=auth.uid();
  else raise exception 'invalid_kind' using errcode='22023'; end if;
  -- 기존 삭제 트리거가 모든 첨부의 Storage 삭제를 대기열에 추가한다.
end $$;
revoke all on function public.withdraw_partner_evidence(uuid,text) from public,anon;
grant execute on function public.withdraw_partner_evidence(uuid,text) to authenticated;

create or replace function public.delete_partner_work_history(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin perform public.withdraw_partner_evidence(p_id,'HISTORY'); end $$;
