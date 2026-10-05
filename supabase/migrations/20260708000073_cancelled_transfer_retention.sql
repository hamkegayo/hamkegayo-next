-- #191: 취소 배치 연결 삭제 이후에도 정산·거래 이력의 5년 파기 기준 보존.
-- 개인정보처리방침 제4조·제11조: legal hold 유지, 거래 목적 종료 후 파기.
alter table public.transfer_batch_results
  add column retention_reservation_ids uuid[] not null default array[]::uuid[],
  add column purge_after timestamptz;

-- 기존 취소 건도 결과 원장에 남은 settlement_ids로 관계를 복원한다.
-- 이미 원본이 파기된 건은 결과 기록 시각을 보수적인 최종 기준으로 삼는다.
update public.transfer_batch_results br set
  retention_reservation_ids=coalesce((
    select array_agg(distinct s.reservation_id)
    from public.settlements st join public.services s on s.id=st.service_id
    where st.id=any(br.settlement_ids)
  ),array[]::uuid[]),
  purge_after=greatest(br.recorded_at,coalesce((
    select max(public.retention_anchor_at(s.reservation_id))
    from public.settlements st join public.services s on s.id=st.service_id
    where st.id=any(br.settlement_ids)
  ),br.recorded_at))+interval '5 years';
alter table public.transfer_batch_results alter column purge_after set not null;

create function public.snapshot_transfer_result_retention()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_anchor timestamptz;
begin
  select coalesce(array_agg(distinct s.reservation_id),array[]::uuid[]),
         max(public.retention_anchor_at(s.reservation_id))
  into new.retention_reservation_ids,v_anchor
  from public.settlements st join public.services s on s.id=st.service_id
  where st.id=any(new.settlement_ids);
  new.purge_after:=greatest(new.recorded_at,coalesce(v_anchor,new.recorded_at))+interval '5 years';
  return new;
end $$;
revoke all on function public.snapshot_transfer_result_retention() from public,anon,authenticated,service_role;
create trigger trg_transfer_result_retention before insert on public.transfer_batch_results
for each row execute function public.snapshot_transfer_result_retention();

alter function public.run_retention_purge() rename to run_retention_purge_before_cancelled_batches;
revoke all on function public.run_retention_purge_before_cancelled_batches() from public,anon,authenticated,service_role;
create function public.run_retention_purge()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_count integer; v_result jsonb;
begin
  -- 원본 예약이 지워져도 고정된 만료 시각을 사용하고 새 보류를 매번 확인한다.
  delete from public.transfer_batches b using public.transfer_batch_results br
  where b.id=br.batch_id and b.status='CANCELLED' and br.status='CANCELLED'
    and br.purge_after<=now()
    and not exists (
      select 1 from public.retention_legal_holds h
      where h.reservation_id=any(br.retention_reservation_ids) and h.released_at is null
    )
    and not exists (
      select 1 from public.settlements st join public.services s on s.id=st.service_id
      where st.id=any(br.settlement_ids) and (
        public.retention_anchor_at(s.reservation_id) is null
        or public.retention_anchor_at(s.reservation_id)>now()-interval '5 years'
        or exists(select 1 from public.retention_legal_holds h
          where h.reservation_id=s.reservation_id and h.released_at is null)
      )
    );
  get diagnostics v_count=row_count;
  v_result:=public.run_retention_purge_before_cancelled_batches();
  if v_count>0 then
    insert into public.retention_purge_runs(result)
      values(jsonb_build_object('cancelled_transfer_batches',v_count,'at',now()));
  end if;
  return v_result||jsonb_build_object('cancelled_transfer_batches',v_count);
end $$;
revoke all on function public.run_retention_purge() from public,anon,authenticated;
grant execute on function public.run_retention_purge() to service_role;
