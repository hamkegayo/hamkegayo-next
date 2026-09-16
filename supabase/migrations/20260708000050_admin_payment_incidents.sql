-- =============================================================
-- 관리자 결제 사고 추적 — #80 (PG 호출 없는 1차 범위)
--  - 목록/상세는 RPC로만 열고 접속기록을 남긴다.
--  - 상태는 OPEN -> ACKNOWLEDGED -> RESOLVED 순서만 허용한다.
--  - 고객 안내는 방법·내용·시각을 별도 불변 이력으로 남긴다.
--
-- 개인정보처리방침 제13조 — 개인정보 접근권한 관리 및 접근통제
-- =============================================================

create table if not exists public.payment_incident_actions (
  id             bigint generated always as identity primary key,
  incident_id    uuid not null references public.payment_incidents (id) on delete cascade,
  actor_id       uuid not null references public.profiles (id),
  action         text not null check (action in ('STATUS_CHANGED', 'CUSTOMER_CONTACT')),
  from_status    public.payment_incident_status,
  to_status      public.payment_incident_status,
  contact_method text check (contact_method in ('PHONE', 'EMAIL', 'KAKAO', 'OTHER')),
  note           text not null check (char_length(btrim(note)) between 2 and 1000),
  created_at     timestamptz not null default now(),
  check (
    (action = 'STATUS_CHANGED'
      and from_status is not null
      and to_status is not null
      and contact_method is null)
    or
    (action = 'CUSTOMER_CONTACT'
      and from_status is null
      and to_status is null
      and contact_method is not null)
  )
);

comment on table public.payment_incident_actions is
  '결제 사고 상태 변경·고객 안내 이력. 관리자 RPC로만 추가·조회한다.';

create index if not exists idx_payment_incident_actions_incident
  on public.payment_incident_actions (incident_id, created_at desc);

alter table public.payment_incident_actions enable row level security;
revoke all on public.payment_incident_actions from anon, authenticated;

-- ---------- 대시보드 요약 ----------
create or replace function public.admin_payment_incident_summary()
returns table (
  open_count bigint,
  critical_count bigint
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
  select
    count(*) filter (where i.status <> 'RESOLVED'::public.payment_incident_status),
    count(*) filter (
      where i.status <> 'RESOLVED'::public.payment_incident_status
        and i.severity = 'CRITICAL'::public.payment_incident_severity
    )
  from public.payment_incidents i;
end;
$$;

comment on function public.admin_payment_incident_summary() is
  '관리자 홈의 미처리·최상 결제 사고 건수. 개인정보를 반환하지 않는다.';

-- ---------- 사고 목록·상세 ----------
create or replace function public.admin_list_payment_incidents(
  p_status text default null
)
returns table (
  id uuid,
  payment_id uuid,
  reservation_id uuid,
  order_id text,
  kind text,
  severity text,
  status text,
  amount integer,
  detail jsonb,
  memo text,
  created_at timestamptz,
  updated_at timestamptz,
  history jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_status is not null
     and p_status not in ('OPEN', 'ACKNOWLEDGED', 'RESOLVED') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  perform public.log_access('PAYMENT_INCIDENT_LIST', 'payment_incidents');

  return query
  select i.id, i.payment_id, i.reservation_id, i.order_id,
         i.kind::text, i.severity::text, i.status::text,
         i.amount, i.detail, i.memo, i.created_at, i.updated_at,
         coalesce((
           select jsonb_agg(h.entry order by h.created_at desc)
             from (
               select a.created_at,
                      jsonb_build_object(
                        'id', a.id,
                        'action', a.action,
                        'fromStatus', a.from_status,
                        'toStatus', a.to_status,
                        'contactMethod', a.contact_method,
                        'note', a.note,
                        'createdAt', a.created_at
                      ) as entry
                 from public.payment_incident_actions a
                where a.incident_id = i.id
                order by a.created_at desc
                limit 20
             ) h
         ), '[]'::jsonb)
    from (
      select *
        from public.payment_incidents i
       where p_status is null or i.status = p_status::public.payment_incident_status
       order by
         case i.status
           when 'OPEN'::public.payment_incident_status then 0
           when 'ACKNOWLEDGED'::public.payment_incident_status then 1
           else 2
         end,
         case i.severity
           when 'CRITICAL'::public.payment_incident_severity then 0
           when 'HIGH'::public.payment_incident_severity then 1
           else 2
         end,
         i.created_at desc
       limit 100
    ) i;
end;
$$;

comment on function public.admin_list_payment_incidents(text) is
  '결제 사고 목록·PG 응답·처리 이력을 반환하고 관리자 접속기록을 남긴다.';

-- ---------- 상태 전이 ----------
create or replace function public.admin_get_payment_incident_reservation(
  p_incident_id uuid
)
returns public.reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.reservations;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select r.* into v_row
    from public.payment_incidents i
    join public.reservations r on r.id = i.reservation_id
   where i.id = p_incident_id;

  if not found then
    raise exception 'incident_reservation_not_found' using errcode = 'P0002';
  end if;

  perform public.log_access(
    'RESERVATION_READ', 'reservations', v_row.id, v_row.customer_id,
    '결제 사고 ' || p_incident_id::text || ' 처리'
  );

  return v_row;
end;
$$;

comment on function public.admin_get_payment_incident_reservation(uuid) is
  '결제 사고와 실제로 연결된 예약만 반환하고, 결제 사고 ID를 사유로 접속기록을 남긴다.';

create or replace function public.admin_update_payment_incident(
  p_id uuid,
  p_status text,
  p_memo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.payment_incident_status;
  v_to   public.payment_incident_status;
begin
  if not public.is_admin_live() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_memo, ''))) not between 2 and 1000 then
    raise exception 'memo_required' using errcode = '22023';
  end if;

  begin
    v_to := p_status::public.payment_incident_status;
  exception when invalid_text_representation then
    raise exception 'invalid_status' using errcode = '22023';
  end;

  select i.status into v_from
    from public.payment_incidents i
   where i.id = p_id
   for update;

  if v_from is null then
    raise exception 'incident_not_found' using errcode = 'P0002';
  end if;
  if not (
    (v_from = 'OPEN'::public.payment_incident_status
      and v_to = 'ACKNOWLEDGED'::public.payment_incident_status)
    or
    (v_from = 'ACKNOWLEDGED'::public.payment_incident_status
      and v_to = 'RESOLVED'::public.payment_incident_status)
  ) then
    raise exception 'invalid_incident_transition' using errcode = 'P0001';
  end if;

  update public.payment_incidents
     set status = v_to,
         memo = btrim(p_memo),
         resolved_by = case when v_to = 'RESOLVED' then auth.uid() else null end,
         resolved_at = case when v_to = 'RESOLVED' then now() else null end
   where id = p_id;

  insert into public.payment_incident_actions
    (incident_id, actor_id, action, from_status, to_status, note)
  values
    (p_id, auth.uid(), 'STATUS_CHANGED', v_from, v_to, btrim(p_memo));

  perform public.log_access(
    'PAYMENT_INCIDENT_STATUS', 'payment_incidents', p_id, null,
    v_from::text || ' -> ' || v_to::text
  );
end;
$$;

comment on function public.admin_update_payment_incident(uuid, text, text) is
  '결제 사고를 OPEN→ACKNOWLEDGED→RESOLVED 순서로 변경하고 불변 이력·접속기록을 남긴다.';

-- ---------- 고객 안내 이력 ----------
create or replace function public.admin_record_payment_incident_contact(
  p_id uuid,
  p_method text,
  p_note text
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
  if p_method is null or p_method not in ('PHONE', 'EMAIL', 'KAKAO', 'OTHER') then
    raise exception 'invalid_contact_method' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 2 then
    raise exception 'note_required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.payment_incidents where id = p_id) then
    raise exception 'incident_not_found' using errcode = 'P0002';
  end if;

  insert into public.payment_incident_actions
    (incident_id, actor_id, action, contact_method, note)
  values
    (p_id, auth.uid(), 'CUSTOMER_CONTACT', p_method, btrim(p_note));

  perform public.log_access(
    'PAYMENT_INCIDENT_CONTACT', 'payment_incidents', p_id, null,
    p_method
  );
end;
$$;

comment on function public.admin_record_payment_incident_contact(uuid, text, text) is
  '결제 사고 고객 안내의 방법·내용·시각을 불변 이력과 접속기록에 남긴다.';

revoke all on function public.admin_payment_incident_summary() from public, anon;
revoke all on function public.admin_list_payment_incidents(text) from public, anon;
revoke all on function public.admin_get_payment_incident_reservation(uuid) from public, anon;
revoke all on function public.admin_update_payment_incident(uuid, text, text) from public, anon;
revoke all on function public.admin_record_payment_incident_contact(uuid, text, text) from public, anon;

grant execute on function public.admin_payment_incident_summary() to authenticated;
grant execute on function public.admin_list_payment_incidents(text) to authenticated;
grant execute on function public.admin_get_payment_incident_reservation(uuid) to authenticated;
grant execute on function public.admin_update_payment_incident(uuid, text, text) to authenticated;
grant execute on function public.admin_record_payment_incident_contact(uuid, text, text) to authenticated;
