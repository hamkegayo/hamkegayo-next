-- #56 관리자 이체 배치 생성.
-- 약관 제21조 ③에 따라 실제 이용 내역이 반영되어 승인된 정산만 배치에 편입한다.
-- 배치 생성은 지급 완료가 아니며, 은행 파일 발급 및 지급 결과 반영은 후속 단계에서 처리한다.

create type public.transfer_batch_status as enum (
  'DRAFT', 'FILE_ISSUED', 'COMPLETED', 'CANCELLED'
);

create table public.transfer_batches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status public.transfer_batch_status not null default 'DRAFT',
  reason text not null,
  settlement_count integer not null check (settlement_count > 0),
  partner_count integer not null check (partner_count > 0),
  total_net integer not null check (total_net > 0),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.transfer_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.transfer_batches (id) on delete cascade,
  partner_id uuid not null references public.profiles (id),
  amount integer not null check (amount > 0),
  settlement_count integer not null check (settlement_count > 0),
  bank_code text not null,
  bank_name text not null,
  account_number text not null,
  account_last4 text not null,
  holder_name text not null,
  created_at timestamptz not null default now(),
  unique (batch_id, partner_id)
);

create table public.transfer_batch_settlements (
  batch_id uuid not null references public.transfer_batches (id) on delete cascade,
  item_id uuid not null references public.transfer_batch_items (id) on delete cascade,
  settlement_id uuid not null references public.settlements (id),
  created_at timestamptz not null default now(),
  primary key (batch_id, settlement_id),
  unique (settlement_id)
);

comment on table public.transfer_batches is
  '승인된 정산을 이체 단위로 묶은 배치. 생성 자체는 지급 완료를 뜻하지 않는다.';
comment on table public.transfer_batch_items is
  '파트너별 이체 1건. 배치 생성 당시의 계좌를 스냅샷으로 보존한다.';
comment on column public.transfer_batch_items.account_number is
  '은행 이체 파일 생성용 민감정보. 일반 목록 RPC에서는 반환하지 않는다.';
comment on table public.transfer_batch_settlements is
  '정산-이체 배치 연결. settlement_id unique 제약으로 중복 편입을 차단한다.';

create index idx_transfer_batches_created_at
  on public.transfer_batches (created_at desc);
create index idx_transfer_batch_items_batch
  on public.transfer_batch_items (batch_id, partner_id);

alter table public.transfer_batches enable row level security;
alter table public.transfer_batch_items enable row level security;
alter table public.transfer_batch_settlements enable row level security;

create trigger trg_transfer_batches_updated_at
  before update on public.transfer_batches
  for each row execute function public.set_updated_at();

create or replace function public.admin_create_transfer_batch(
  p_ids uuid[], p_reason text
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_batch_id uuid := gen_random_uuid();
  v_code text;
  v_requested integer;
  v_eligible integer;
  v_partner_count integer;
  v_total integer;
begin
  if not public.can_manage_settlements() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_requested := coalesce(array_length(p_ids, 1), 0);
  if v_requested < 1 or v_requested > 200
     or length(btrim(coalesce(p_reason, ''))) not between 5 and 500 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if v_requested <> (select count(distinct id) from unnest(p_ids) as u(id)) then
    raise exception 'duplicate_input' using errcode = '22023';
  end if;

  -- 동시 요청끼리 동일 정산을 가져가지 못하도록 먼저 잠근다.
  perform 1
    from public.settlements st
   where st.id = any(p_ids)
   order by st.id
   for update;

  select count(*) into v_eligible
    from public.settlements st
   where st.id = any(p_ids)
     and st.status = 'APPROVED'::public.settlement_status
     and not exists (
       select 1 from public.transfer_batch_settlements tbs
        where tbs.settlement_id = st.id
     )
     and exists (
       select 1 from public.partner_payouts pp
        where pp.partner_id = st.partner_id
     );

  if v_eligible <> v_requested then
    raise exception 'settlement_not_batchable' using errcode = '23514';
  end if;

  select count(*), sum(partner_net)
    into v_partner_count, v_total
    from (
      select st.partner_id, sum(st.net)::integer as partner_net
        from public.settlements st
       where st.id = any(p_ids)
       group by st.partner_id
    ) grouped
   where partner_net > 0;

  if v_partner_count <> (
       select count(distinct st.partner_id)
         from public.settlements st where st.id = any(p_ids)
     ) or coalesce(v_total, 0) <= 0 then
    raise exception 'non_positive_transfer_amount' using errcode = '23514';
  end if;

  v_code := 'TB-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS-')
            || upper(substr(replace(v_batch_id::text, '-', ''), 1, 6));

  insert into public.transfer_batches (
    id, code, reason, settlement_count, partner_count, total_net, created_by
  ) values (
    v_batch_id, v_code, btrim(p_reason), v_requested, v_partner_count,
    v_total, auth.uid()
  );

  insert into public.transfer_batch_items (
    batch_id, partner_id, amount, settlement_count,
    bank_code, bank_name, account_number, account_last4, holder_name
  )
  select v_batch_id, st.partner_id, sum(st.net)::integer, count(*)::integer,
         pp.bank_code, pp.bank_name, pp.account_number, pp.account_last4,
         pp.holder_name
    from public.settlements st
    join public.partner_payouts pp on pp.partner_id = st.partner_id
   where st.id = any(p_ids)
   group by st.partner_id, pp.bank_code, pp.bank_name, pp.account_number,
            pp.account_last4, pp.holder_name;

  insert into public.transfer_batch_settlements (batch_id, item_id, settlement_id)
  select v_batch_id, bi.id, st.id
    from public.settlements st
    join public.transfer_batch_items bi
      on bi.batch_id = v_batch_id and bi.partner_id = st.partner_id
   where st.id = any(p_ids);

  perform public.log_access(
    'TRANSFER_BATCH_CREATE', 'transfer_batches', v_batch_id, null,
    btrim(p_reason) || ' / ' || v_requested || '건 / ' || v_partner_count || '명'
  );

  return jsonb_build_object(
    'id', v_batch_id,
    'code', v_code,
    'settlementCount', v_requested,
    'partnerCount', v_partner_count,
    'totalNet', v_total
  );
end;
$$;

create or replace function public.admin_list_transfer_batches(
  p_limit integer default 100
)
returns table (
  id uuid,
  code text,
  status public.transfer_batch_status,
  reason text,
  settlement_count integer,
  partner_count integer,
  total_net integer,
  created_by_name text,
  created_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_settlements() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.log_access('TRANSFER_BATCH_LIST', 'transfer_batches', null, null, null);
  return query
  select b.id, b.code, b.status, b.reason, b.settlement_count,
         b.partner_count, b.total_net, p.name, b.created_at
    from public.transfer_batches b
    join public.profiles p on p.id = b.created_by
   order by b.created_at desc
   limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

create or replace function public.admin_list_transfer_batch_items(p_batch_id uuid)
returns table (
  id uuid,
  partner_id uuid,
  partner_name text,
  amount integer,
  settlement_count integer,
  bank_name text,
  account_last4 text,
  holder_name text
)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_settlements() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.log_access(
    'TRANSFER_BATCH_DETAIL', 'transfer_batches', p_batch_id, null, null
  );
  return query
  select bi.id, bi.partner_id, p.name, bi.amount, bi.settlement_count,
         bi.bank_name, bi.account_last4, bi.holder_name
    from public.transfer_batch_items bi
    join public.profiles p on p.id = bi.partner_id
   where bi.batch_id = p_batch_id
   order by p.name, bi.partner_id;
end;
$$;

create or replace function public.admin_list_batched_settlement_ids()
returns table (settlement_id uuid, batch_id uuid, batch_code text)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_settlements() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select bs.settlement_id, bs.batch_id, b.code
    from public.transfer_batch_settlements bs
    join public.transfer_batches b on b.id = bs.batch_id
   where b.status <> 'CANCELLED'::public.transfer_batch_status;
end;
$$;

revoke all on function public.admin_create_transfer_batch(uuid[], text)
  from public, anon;
revoke all on function public.admin_list_transfer_batches(integer)
  from public, anon;
revoke all on function public.admin_list_transfer_batch_items(uuid)
  from public, anon;
revoke all on function public.admin_list_batched_settlement_ids()
  from public, anon;
grant execute on function public.admin_create_transfer_batch(uuid[], text)
  to authenticated;
grant execute on function public.admin_list_transfer_batches(integer)
  to authenticated;
grant execute on function public.admin_list_transfer_batch_items(uuid)
  to authenticated;
grant execute on function public.admin_list_batched_settlement_ids()
  to authenticated;

-- 활성 이체 배치에 포함된 승인 건은 합계가 고정되므로 보류로 되돌릴 수 없다.
create or replace function public.admin_hold_settlements(
  p_ids uuid[], p_reason text
)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_count integer := 0; v_partner uuid;
begin
  if not public.can_manage_settlements() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(array_length(p_ids, 1), 0) < 1 or coalesce(array_length(p_ids, 1), 0) > 200
     or length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  foreach v_id in array p_ids loop
    update public.settlements st
       set status = 'HOLD'::public.settlement_status, confirmed_at = null
     where st.id = v_id
       and st.status in (
         'PENDING'::public.settlement_status, 'APPROVED'::public.settlement_status
       )
       and not exists (
         select 1
           from public.transfer_batch_settlements tbs
           join public.transfer_batches tb on tb.id = tbs.batch_id
          where tbs.settlement_id = st.id
            and tb.status <> 'CANCELLED'::public.transfer_batch_status
       )
     returning st.partner_id into v_partner;
    if v_partner is null then
      raise exception 'settlement_not_holdable' using errcode = '23514';
    end if;
    perform public.log_access(
      'SETTLEMENT_HOLD', 'settlements', v_id, v_partner, btrim(p_reason)
    );
    v_count := v_count + 1;
    v_partner := null;
  end loop;
  return v_count;
end;
$$;
