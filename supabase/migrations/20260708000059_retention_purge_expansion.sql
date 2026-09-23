-- =============================================================
-- 보유기간 만료 파기 배치 확장 (#99)
-- 개인정보처리방침 제4조 · 제11조 ①·③
--
--  3년: 예약 개인정보, 리포트 자유입력 민감정보, 첨부파일,
--        해결된 소비자 불만·분쟁 기록
--  5년: 결제·환불·정산 및 비민감 서비스 수행기록
--  예외: 사고·분쟁·수사·소송의 active legal hold
--
-- 첨부파일은 storage.objects 를 SQL 로 지우지 않는다. SQL 삭제는 실제
-- 객체를 orphan 으로 남기므로 Storage API 삭제 → 메타데이터 확인 순서를 쓴다.
-- =============================================================

-- 예약 행은 5년 거래 원장의 FK 루트다. 3년에 행을 지우면 결제·정산까지
-- cascade 되므로 개인정보 컬럼만 NULL 로 파기하고, 5년에 행 자체를 지운다.
alter table public.reservations
  alter column customer_id drop not null,
  alter column plan drop not null,
  alter column patient_name drop not null,
  alter column patient_birth drop not null,
  alter column patient_gender drop not null,
  alter column patient_phone drop not null,
  alter column guardian_name drop not null,
  alter column guardian_phone drop not null,
  alter column relation drop not null,
  alter column treatment drop not null,
  alter column purpose drop not null,
  alter column use_date drop not null,
  alter column arrive_time drop not null,
  alter column reserve_time drop not null,
  alter column duration drop not null,
  alter column depart_address drop not null,
  alter column hospital_address drop not null;

alter table public.reservations
  add column if not exists personal_data_purged_at timestamptz;

alter table public.services
  add column if not exists sensitive_data_purged_at timestamptz;

alter table public.reports
  add column if not exists sensitive_data_purged_at timestamptz;

comment on column public.reservations.personal_data_purged_at is
  '서비스 종료 또는 취소 후 3년이 지나 예약 개인정보를 NULL 처리한 시각(처리방침 제4조).';
comment on column public.services.sensitive_data_purged_at is
  '서비스 종료 후 3년이 지나 자유입력 메모를 파기한 시각(처리방침 제4조).';
comment on column public.reports.sensitive_data_purged_at is
  '서비스 종료 후 3년이 지나 민감정보가 섞일 수 있는 리포트 본문을 파기한 시각(처리방침 제4조).';

create index if not exists idx_reservations_retention_cancelled
  on public.reservations (cancelled_at)
  where status = 'CANCELLED'::public.reservation_status;
create index if not exists idx_services_retention_ended
  on public.services (ended_at, auto_closed_at);
create index if not exists idx_payment_incidents_retention_resolved
  on public.payment_incidents (resolved_at)
  where status = 'RESOLVED'::public.payment_incident_status;

-- =============================================================
-- 파기 보류 — 사고·분쟁·수사·소송의 최종 종료 전까지
-- =============================================================
create table if not exists public.retention_legal_holds (
  reservation_id uuid primary key references public.reservations (id) on delete cascade,
  reason         text not null check (length(btrim(reason)) between 5 and 500),
  held_by        uuid not null references public.profiles (id),
  held_at        timestamptz not null default now(),
  released_by    uuid references public.profiles (id),
  released_at    timestamptz,
  release_reason text,
  constraint retention_legal_holds_release_chk check (
    (released_at is null and released_by is null and release_reason is null)
    or
    (released_at is not null and released_by is not null
      and length(btrim(release_reason)) between 5 and 500)
  )
);

comment on table public.retention_legal_holds is
  '사고·분쟁·수사·소송 예약의 파기 보류 원장. released_at 이 NULL 인 동안 모든 보유기간 파기에서 제외한다(처리방침 제4조·제11조 ③).';

alter table public.retention_legal_holds enable row level security;
revoke all on public.retention_legal_holds from anon, authenticated;

create or replace function public.admin_hold_reservation_retention(
  p_reservation_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin_live() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 5 and 500 then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  if not exists (select 1 from public.reservations where id = p_reservation_id) then
    raise exception 'reservation_not_found' using errcode = 'P0002';
  end if;

  insert into public.retention_legal_holds (
    reservation_id, reason, held_by, held_at,
    released_by, released_at, release_reason
  ) values (
    p_reservation_id, btrim(p_reason), auth.uid(), now(), null, null, null
  )
  on conflict (reservation_id) do update
    set reason = excluded.reason,
        held_by = excluded.held_by,
        held_at = excluded.held_at,
        released_by = null,
        released_at = null,
        release_reason = null
  where public.retention_legal_holds.released_at is not null;

  if not found then
    raise exception 'already_held' using errcode = '23505';
  end if;

  perform public.log_access(
    'RETENTION_HOLD', 'reservations', p_reservation_id, null, btrim(p_reason)
  );
end;
$$;

create or replace function public.admin_release_reservation_retention(
  p_reservation_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin_live() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 5 and 500 then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;

  update public.retention_legal_holds
     set released_by = auth.uid(),
         released_at = now(),
         release_reason = btrim(p_reason)
   where reservation_id = p_reservation_id
     and released_at is null;

  if not found then
    raise exception 'active_hold_not_found' using errcode = 'P0002';
  end if;

  perform public.log_access(
    'RETENTION_HOLD_RELEASE', 'reservations', p_reservation_id, null,
    btrim(p_reason)
  );
end;
$$;

revoke all on function public.admin_hold_reservation_retention(uuid, text)
  from public, anon;
revoke all on function public.admin_release_reservation_retention(uuid, text)
  from public, anon;
grant execute on function public.admin_hold_reservation_retention(uuid, text)
  to authenticated;
grant execute on function public.admin_release_reservation_retention(uuid, text)
  to authenticated;

-- 정상 종료·노쇼는 ended_at, 자동 마감은 auto_closed_at, 취소는 cancelled_at.
-- 종료 근거가 없는 기존 행은 추정하지 않고 NULL 로 남겨 자동 파기하지 않는다.
create or replace function public.retention_anchor_at(p_reservation_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when r.status = 'CANCELLED'::public.reservation_status then r.cancelled_at
    when s.auto_closed_at is not null then s.auto_closed_at
    else s.ended_at
  end
  from public.reservations r
  left join public.services s on s.reservation_id = r.id
  where r.id = p_reservation_id
$$;

comment on function public.retention_anchor_at(uuid) is
  '보유기간 기산점. 취소=cancelled_at, 자동마감=auto_closed_at, 정상종료·노쇼=ended_at. 근거 없는 행은 NULL.';
revoke all on function public.retention_anchor_at(uuid)
  from public, anon, authenticated;

-- =============================================================
-- Storage API용 대상 조회·확정
-- =============================================================
create or replace function public.list_retention_attachment_paths(
  p_limit integer default 1000
)
returns table (path text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.path
    from public.report_attachments a
    join public.reports rp on rp.id = a.report_id
    join public.services s on s.id = rp.service_id
   where public.retention_anchor_at(s.reservation_id) <= now() - interval '3 years'
     and not exists (
       select 1 from public.retention_legal_holds h
        where h.reservation_id = s.reservation_id and h.released_at is null
     )
   order by a.created_at, a.id
   limit least(greatest(coalesce(p_limit, 1000), 1), 1000)
$$;

create or replace function public.confirm_retention_attachment_purge(
  p_paths text[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with gone as (
    delete from public.report_attachments a
     using public.reports rp, public.services s
     where a.path = any(coalesce(p_paths, array[]::text[]))
       and rp.id = a.report_id
       and s.id = rp.service_id
       and public.retention_anchor_at(s.reservation_id) <= now() - interval '3 years'
       and not exists (
         select 1 from public.retention_legal_holds h
          where h.reservation_id = s.reservation_id and h.released_at is null
       )
    returning 1
  )
  select count(*)::integer into v_count from gone;
  return v_count;
end;
$$;

revoke all on function public.list_retention_attachment_paths(integer)
  from public, anon, authenticated;
revoke all on function public.confirm_retention_attachment_purge(text[])
  from public, anon, authenticated;

-- 파기 결과에는 대상 식별자를 남기지 않고 집계 건수만 보관한다.
create table if not exists public.retention_purge_runs (
  id          bigint generated always as identity primary key,
  ran_at      timestamptz not null default now(),
  result      jsonb not null
);

comment on table public.retention_purge_runs is
  '개인정보 없는 파기 배치 집계 로그. 대상 ID·이름·경로는 기록하지 않는다.';
alter table public.retention_purge_runs enable row level security;
revoke all on public.retention_purge_runs from anon, authenticated;

-- =============================================================
-- 일일 파기 배치
-- =============================================================
create or replace function public.run_retention_purge()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_members             integer := 0;
  v_otp                 integer := 0;
  v_reservations_scrub  integer := 0;
  v_services_scrub      integer := 0;
  v_reports_scrub       integer := 0;
  v_incidents           integer := 0;
  v_reservations_delete integer := 0;
  v_result              jsonb;
  v_candidates          uuid[] := array[]::uuid[];
  v_deletable           uuid[] := array[]::uuid[];
begin
  -- 회원 탈퇴 후 3년 분리 보관본.
  with gone as (
    delete from public.withdrawn_members where purge_after <= now() returning 1
  ) select count(*)::integer into v_members from gone;

  -- 이메일 OTP는 생성 후 30일.
  with gone as (
    delete from public.email_verifications
     where created_at <= now() - interval '30 days'
    returning 1
  ) select count(*)::integer into v_otp from gone;

  -- 3년: 예약 개인정보 파기. 금액 스냅샷과 취소·거래 상태는 5년 원장에 남긴다.
  update public.reservations r
     set customer_id = null,
         confirmed_partner_id = null,
         plan = null,
         patient_name = null,
         patient_birth = null,
         patient_gender = null,
         patient_phone = null,
         guardian_name = null,
         guardian_phone = null,
         relation = null,
         treatment = null,
         purpose = null,
         cautions = null,
         doc_prescription = false,
         doc_receipt = false,
         doc_certificate = false,
         other_requests = null,
         use_date = null,
         arrive_time = null,
         reserve_time = null,
         duration = null,
         duration_minutes = null,
         depart_address = null,
         hospital_address = null,
         hospital_name = null,
         mobility_status = null,
         cognitive_status = null,
         transport_to = null,
         transport_home = null,
         end_method = null,
         handover_name = null,
         handover_relation = null,
         handover_phone = null,
         backup_handover_name = null,
         backup_handover_relation = null,
         backup_handover_phone = null,
         notify_target = null,
         share_medical_info = false,
         payment_deadline = null,
         personal_data_purged_at = now()
   where r.personal_data_purged_at is null
     and public.retention_anchor_at(r.id) <= now() - interval '3 years'
     and not exists (
       select 1 from public.retention_legal_holds h
        where h.reservation_id = r.id and h.released_at is null
     );
  get diagnostics v_reservations_scrub = row_count;

  -- 자유입력 필드는 민감/비민감 문장을 기계적으로 분리할 수 없으므로
  -- 3년 시점에 전체 본문을 파기하고 구조·시각만 5년까지 유지한다.
  update public.services s
     set start_memo = null,
         end_memo = null,
         sensitive_data_purged_at = now()
   where s.sensitive_data_purged_at is null
     and public.retention_anchor_at(s.reservation_id) <= now() - interval '3 years'
     and not exists (
       select 1 from public.retention_legal_holds h
        where h.reservation_id = s.reservation_id and h.released_at is null
     );
  get diagnostics v_services_scrub = row_count;

  update public.reports rp
     set supports = array[]::text[],
         exam = null,
         guardian_note = null,
         sensitive_data_purged_at = now()
    from public.services s
   where s.id = rp.service_id
     and rp.sensitive_data_purged_at is null
     and public.retention_anchor_at(s.reservation_id) <= now() - interval '3 years'
     and not exists (
       select 1 from public.retention_legal_holds h
        where h.reservation_id = s.reservation_id and h.released_at is null
     );
  get diagnostics v_reports_scrub = row_count;

  -- 해결된 소비자 불만·분쟁만 종료 후 3년에 파기한다. 미해결 건은 남긴다.
  with gone as (
    delete from public.payment_incidents pi
     where pi.status = 'RESOLVED'::public.payment_incident_status
       and pi.resolved_at <= now() - interval '3 years'
       and (
         pi.reservation_id is null
         or not exists (
           select 1 from public.retention_legal_holds h
            where h.reservation_id = pi.reservation_id and h.released_at is null
         )
       )
    returning 1
  ) select count(*)::integer into v_incidents from gone;

  -- 5년 후보. Storage 메타가 남은 건은 실제 파일 삭제가 끝날 때까지 보류한다.
  select coalesce(array_agg(r.id), array[]::uuid[])
    into v_candidates
    from public.reservations r
   where public.retention_anchor_at(r.id) <= now() - interval '5 years'
     and not exists (
       select 1 from public.retention_legal_holds h
        where h.reservation_id = r.id and h.released_at is null
     )
     and not exists (
       select 1
         from public.services s
         join public.reports rp on rp.service_id = s.id
         join public.report_attachments ra on ra.report_id = rp.id
        where s.reservation_id = r.id
     );

  -- 이체 배치 항목은 포함된 정산이 모두 만료 후보일 때만 지운다.
  -- 혼합 항목을 일부만 지우면 CSV 합계와 건수가 거짓이 되기 때문이다.
  delete from public.transfer_batch_items bi
   where exists (
     select 1
       from public.transfer_batch_settlements tbs
       join public.settlements st on st.id = tbs.settlement_id
       join public.services s on s.id = st.service_id
      where tbs.item_id = bi.id and s.reservation_id = any(v_candidates)
   )
     and not exists (
       select 1
         from public.transfer_batch_settlements tbs
         join public.settlements st on st.id = tbs.settlement_id
         join public.services s on s.id = st.service_id
        where tbs.item_id = bi.id and not (s.reservation_id = any(v_candidates))
     );

  -- 남은 항목 기준으로 배치 집계를 다시 맞추고 빈 배치는 파기한다.
  update public.transfer_batches b
     set settlement_count = x.settlement_count,
         partner_count = x.partner_count,
         total_net = x.total_net
    from (
      select bi.batch_id,
             sum(bi.settlement_count)::integer as settlement_count,
             count(*)::integer as partner_count,
             sum(bi.amount)::integer as total_net
        from public.transfer_batch_items bi
       group by bi.batch_id
    ) x
   where x.batch_id = b.id;

  delete from public.transfer_batches b
   where not exists (
     select 1 from public.transfer_batch_items bi where bi.batch_id = b.id
   );

  -- 혼합 이체 항목 때문에 아직 참조되는 정산이 있는 예약은 다음 배치로 미룬다.
  select coalesce(array_agg(rid), array[]::uuid[])
    into v_deletable
    from unnest(v_candidates) as candidate(rid)
   where not exists (
     select 1
       from public.services s
       join public.settlements st on st.service_id = s.id
       join public.transfer_batch_settlements tbs on tbs.settlement_id = st.id
      where s.reservation_id = candidate.rid
   );

  -- 환불 큐가 payments 를 참조하므로 먼저 제거한 뒤 예약 FK 트리를 지운다.
  delete from public.refund_requests where reservation_id = any(v_deletable);

  with gone as (
    delete from public.reservations where id = any(v_deletable) returning 1
  ) select count(*)::integer into v_reservations_delete from gone;

  v_result := jsonb_build_object(
    'withdrawn_purged', v_members,
    'otp_purged', v_otp,
    'reservation_personal_data_purged', v_reservations_scrub,
    'service_sensitive_data_purged', v_services_scrub,
    'report_sensitive_data_purged', v_reports_scrub,
    'incidents_purged', v_incidents,
    'reservation_graphs_purged', v_reservations_delete,
    'at', now()
  );

  insert into public.retention_purge_runs (result) values (v_result);
  return v_result;
end;
$$;

comment on function public.run_retention_purge() is
  '보유기간 만료 개인정보 파기(#99). 처리방침 제4조·제11조 ①. active legal hold 와 Storage API 삭제 대기를 존중하며 결과는 건수만 기록한다.';

revoke all on function public.run_retention_purge()
  from public, anon, authenticated;
