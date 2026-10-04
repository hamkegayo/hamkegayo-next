-- #159: 사용자 확정 이벤트 조건 — 신규 이용자 20명, 첫 1시간 기본요금만 무료.
-- 약관 제9조/제21조: 선택→PG 선결제→확정 순서를 유지한다.
-- 본인인증 수단·식별값 보유기간 확인 전에는 integration_ready=false로 공개/할인을 차단한다.
create table if not exists public.opening_campaign (
  id boolean primary key default true check (id),
  active boolean not null default false,
  integration_ready boolean not null default false,
  capacity integer not null default 20 check (capacity = 20),
  used_count integer not null default 0 check (used_count between 0 and 20),
  updated_at timestamptz not null default now()
);
insert into public.opening_campaign (id) values (true) on conflict do nothing;
create table if not exists public.opening_event_identities (
  customer_id uuid primary key references public.profiles(id) on delete cascade,
  identity_hash text not null check (identity_hash ~ '^[a-f0-9]{64}$'),
  verification_source text not null,
  verified_at timestamptz not null,
  excluded boolean not null default false
);
comment on table public.opening_event_identities is '본인인증 제공자 확인 후 서버가 기록할 HMAC 식별값. 원시 휴대폰 번호 저장 금지. 공개 조회 없음.';
create table if not exists public.opening_event_claims (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.profiles(id) on delete set null,
  identity_hash text not null,
  payment_id uuid not null unique references public.payments(id),
  reservation_id uuid not null references public.reservations(id),
  discount_amount integer not null check (discount_amount in (20000, 25000)),
  state text not null default 'HELD' check (state in ('HELD','USED','RELEASED')),
  sequence integer unique check (sequence between 1 and 20),
  held_at timestamptz not null default now(),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  check ((state = 'USED' and sequence is not null and confirmed_at is not null)
    or (state <> 'USED' and sequence is null and confirmed_at is null))
);
create unique index if not exists opening_event_one_customer on public.opening_event_claims(customer_id) where state in ('HELD','USED');
create unique index if not exists opening_event_one_identity on public.opening_event_claims(identity_hash) where state in ('HELD','USED');
alter table public.payments add column if not exists campaign_discount_amount integer not null default 0 check (campaign_discount_amount between 0 and 25000);
comment on column public.payments.campaign_discount_amount is '첫 1시간 무료 할인. discount_amount에 포함되지만 포인트 원장에는 기록하지 않음.';

alter table public.opening_campaign enable row level security;
alter table public.opening_event_identities enable row level security;
alter table public.opening_event_claims enable row level security;
revoke all on public.opening_campaign, public.opening_event_identities, public.opening_event_claims from anon, authenticated;
grant all on public.opening_campaign, public.opening_event_identities, public.opening_event_claims to service_role;

create or replace function public.opening_event_status()
returns table (enabled boolean, remaining integer)
language sql stable security definer set search_path = '' as $$
  select active and integration_ready and used_count < capacity,
    greatest(capacity-used_count,0) from public.opening_campaign where id;
$$;
revoke all on function public.opening_event_status() from public;
grant execute on function public.opening_event_status() to anon, authenticated, service_role;

-- PG 요청 이전의 결제 행을 잠그고 정원을 임시 확보한다. 확정 순번은 아직 부여하지 않는다.
create or replace function public.reserve_opening_event(p_payment_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare p public.payments%rowtype; r public.reservations%rowtype;
  c public.opening_campaign%rowtype; identity public.opening_event_identities%rowtype;
  amount integer; existing public.opening_event_claims%rowtype;
begin
  select * into p from public.payments where id=p_payment_id for update;
  if not found or p.type<>'BASE' or p.status<>'PENDING' then raise exception 'invalid_payment' using errcode='23514'; end if;
  select * into r from public.reservations where id=p.reservation_id;
  if r.status<>'MATCHING' or r.confirmed_partner_id is null or r.payment_deadline is null or r.payment_deadline<=now() then
    raise exception 'invalid_reservation' using errcode='23514';
  end if;
  select * into c from public.opening_campaign where id for update;
  -- 실패/만료된 임시 확보는 선착순 사용 인원에 포함하지 않는다.
  update public.opening_event_claims set state='RELEASED'
    where state='HELD' and expires_at<=now();
  select * into existing from public.opening_event_claims where payment_id=p.id;
  if found and existing.state='HELD' then return existing.discount_amount; end if;
  if not c.active or not c.integration_ready or c.used_count>=20 then raise exception 'campaign_unavailable' using errcode='23514'; end if;
  if exists (select 1 from public.opening_event_claims where payment_id=p.id) then
    raise exception 'claim_expired' using errcode='23514';
  end if;
  select * into identity from public.opening_event_identities where customer_id=r.customer_id;
  if not found or identity.excluded or identity.verified_at>now()
    or not exists (select 1 from public.profiles where id=r.customer_id and role='USER' and status='ACTIVE')
    or exists (select 1 from public.services s join public.reservations b on b.id=s.reservation_id
      where b.customer_id=r.customer_id and (s.started_at is not null or s.status in ('COMPLETED','IN_PROGRESS','ENDED')))
    or exists (select 1 from public.opening_event_claims where state in ('HELD','USED')
      and (customer_id=r.customer_id or identity_hash=identity.identity_hash)) then
    raise exception 'campaign_ineligible' using errcode='23514';
  end if;
  if c.used_count+(select count(*) from public.opening_event_claims where state='HELD')>=20 then
    raise exception 'campaign_capacity_held' using errcode='23514';
  end if;
  if p.discount_amount<>0 or exists (select 1 from public.points where payment_id=p.id and reason='USE') then
    raise exception 'campaign_not_stackable' using errcode='23514';
  end if;
  amount := case r.plan when 'plus' then 25000 else 20000 end;
  if coalesce(r.duration_minutes,120)<120 or p.gross_amount<=amount
    or p.gross_amount<>round(amount*greatest(coalesce(r.duration_minutes,120),120)/60.0*(1+coalesce(r.surcharge_rate,0))) then
    raise exception 'campaign_invalid_amount' using errcode='23514';
  end if;
  insert into public.opening_event_claims(customer_id,identity_hash,payment_id,reservation_id,discount_amount,expires_at)
    values(r.customer_id,identity.identity_hash,p.id,r.id,amount,greatest(r.payment_deadline,now()+interval '10 minutes'));
  -- 할인은 회사 부담. 정상 지급액을 유지하고 회사 수수료만 줄인다.
  update public.payments set campaign_discount_amount=amount, discount_amount=amount,
    commission_amount=commission_amount-amount where id=p.id;
  return amount;
end $$;
revoke all on function public.reserve_opening_event(uuid) from public, anon, authenticated;
grant execute on function public.reserve_opening_event(uuid) to service_role;

-- finalize_payment 트랜잭션 내부: PG PAID 전이와 예약 확정이 모두 성공해야 사용 순번이 남는다.
create or replace function public.commit_opening_event_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare claim public.opening_event_claims%rowtype; sequence_no integer;
begin
  if new.type<>'BASE' or new.campaign_discount_amount=0 then return new; end if;
  if new.status='PAID' and old.status='PENDING' then
    perform 1 from public.opening_campaign where id for update;
    select * into claim from public.opening_event_claims where payment_id=new.id for update;
    if not found or claim.state<>'HELD' or claim.expires_at<=now()
      or new.discount_amount<>claim.discount_amount
      or exists(select 1 from public.points where payment_id=new.id and reason='USE') then raise exception 'campaign_claim_invalid' using errcode='23514'; end if;
    update public.opening_campaign set used_count=used_count+1,updated_at=now() where id and used_count<20
      returning used_count into sequence_no;
    if not found then raise exception 'campaign_full' using errcode='23514'; end if;
    update public.opening_event_claims set state='USED',sequence=sequence_no,confirmed_at=now() where id=claim.id;
  elsif new.status in ('FAILED','CANCELLED') and old.status='PENDING' then
    perform 1 from public.opening_campaign where id for update;
    update public.opening_event_claims set state='RELEASED' where payment_id=new.id and state='HELD';
  end if;
  return new;
end $$;
revoke all on function public.commit_opening_event_payment() from public, anon, authenticated;
drop trigger if exists opening_event_payment_status on public.payments;
create trigger opening_event_payment_status after update of status on public.payments
  for each row execute function public.commit_opening_event_payment();

create or replace function public.can_manage_opening_event()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin_live() and exists(select 1 from public.admin_accounts
    where profile_id=auth.uid() and duty in ('전체','정산'));
$$;
revoke all on function public.can_manage_opening_event() from public, anon;
grant execute on function public.can_manage_opening_event() to authenticated;

create or replace function public.admin_opening_event(p_search text default '',p_page integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_manage_opening_event() then raise exception 'forbidden' using errcode='42501'; end if;
  perform public.log_access('CAMPAIGN_LIST','opening_event_claims',null,null,'오픈 이벤트 현황 조회');
  select jsonb_build_object('active',c.active,'ready',c.integration_ready,'capacity',c.capacity,
    'used',c.used_count,'held',(select count(*) from public.opening_event_claims where state='HELD' and expires_at>now()),
    'rows',coalesce((select jsonb_agg(to_jsonb(rows)) from (
      select cl.id,b.code,cl.state,cl.sequence,cl.discount_amount,cl.held_at,cl.confirmed_at,b.status as reservation_status,
        case when p.name is null then '탈퇴 회원' else left(p.name,1)||'OO' end as customer,
        true as identity_verified
      from public.opening_event_claims cl join public.reservations b on b.id=cl.reservation_id
        left join public.profiles p on p.id=cl.customer_id
      where coalesce(p_search,'')='' or b.code ilike '%'||left(p_search,100)||'%'
      order by cl.held_at desc limit 20 offset least(greatest(coalesce(p_page,0),0),10000)*20
    ) rows),'[]'::jsonb)) into result from public.opening_campaign c where id;
  return result;
end $$;
revoke all on function public.admin_opening_event(text,integer) from public, anon;
grant execute on function public.admin_opening_event(text,integer) to authenticated;

create or replace function public.admin_set_opening_event(p_active boolean,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_opening_event() then raise exception 'forbidden' using errcode='42501'; end if;
  if p_active is null or length(trim(coalesce(p_reason,''))) not between 5 and 500 then
    raise exception 'invalid_reason' using errcode='22023'; end if;
  perform 1 from public.opening_campaign where id for update;
  if p_active and not exists(select 1 from public.opening_campaign where id and integration_ready and used_count<20) then
    raise exception 'integration_not_ready' using errcode='23514'; end if;
  update public.opening_campaign set active=p_active,updated_at=now() where id;
  perform public.log_access('CAMPAIGN_STATUS','opening_campaign',null,null,p_reason);
end $$;
revoke all on function public.admin_set_opening_event(boolean,text) from public, anon;
grant execute on function public.admin_set_opening_event(boolean,text) to authenticated;

create or replace function public.opening_event_offer(p_reservation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.reservations%rowtype; identity public.opening_event_identities%rowtype; c public.opening_campaign%rowtype;
begin
  select * into r from public.reservations where id=p_reservation_id and customer_id=auth.uid();
  if not found then raise exception 'not_found' using errcode='42501'; end if;
  select * into c from public.opening_campaign where id;
  select * into identity from public.opening_event_identities where customer_id=auth.uid();
  return jsonb_build_object('eligible',c.active and c.integration_ready and c.used_count<20
    and r.status='MATCHING' and identity.customer_id is not null and not identity.excluded
    and identity.verified_at<=now()
    and exists(select 1 from public.profiles where id=auth.uid() and role='USER' and status='ACTIVE')
    and not exists(select 1 from public.opening_event_claims where state in ('HELD','USED')
      and (customer_id=auth.uid() or identity_hash=identity.identity_hash))
    and not exists(select 1 from public.services s join public.reservations b on b.id=s.reservation_id
      where b.customer_id=auth.uid() and (s.started_at is not null or s.status in ('COMPLETED','IN_PROGRESS','ENDED'))),
    'discount',case r.plan when 'plus' then 25000 else 20000 end);
end $$;
revoke all on function public.opening_event_offer(uuid) from public, anon;
grant execute on function public.opening_event_offer(uuid) to authenticated;
