-- #297 사용자 확정(2026-10-31): 오픈 이벤트 쿠폰을 서비스별 최초 1시간 요금으로 되돌린다.
--   할인액: Basic 20,000원 / Plus 25,000원 고정. 이용시간·주말·공휴일 할증과 무관하다.
--   정원: 선착순 10명(Basic·Plus 합산). 지금까지 사용된 인원(used_count)을 이어서 센다.
--   기간: 2026-12-31 23:59:59 KST(2027-01-01 00:00 +09:00) 결제 확정분까지. 서비스 이용일이 아니다.
-- 약관 제11조 ①(Basic 시간당 20,000원 / Plus 25,000원)·②(최소 예약 2시간)과 제21조(선결제·최종정산)는 바꾸지 않는다.
--   쿠폰은 회사 부담 할인이고, 정산·부분취소·환불·노쇼는 결제에 저장된 campaign_discount_amount 를 계속 기준으로 한다.
-- 기존 HELD/USED 의 할인액·순번은 수정하지 않는다. used_count 가 이미 10 이상이면 적용 즉시 소진(EXHAUSTED)된다.
-- 사용자 결정(2026-11-02): 행사 종료 = 종료 시각 경과 또는 관리자 종료(closed_at) 중 먼저 오는 쪽.
--   종료 후에는 신규 확보·결제 확정·HMAC 수집·혜택 복원(재사용)을 하지 않는다.
--   관련 결제·취소·환불 처리가 끝나면 기존 일일 작업(069)이 HMAC 을 파기한다. 선착순 소진은 신규 적용 마감일 뿐 종료가 아니다.

-- 정원 20 고정 제약을 10 으로 바꾼다. 20명 시기의 기록(used_count·순번 최대 20)은 그대로 두므로
-- 상한은 확정 트리거의 capacity 검사가 맡는다.
alter table public.opening_campaign drop constraint if exists opening_campaign_capacity_check;
alter table public.opening_campaign drop constraint if exists opening_campaign_used_count_check;
alter table public.opening_event_claims drop constraint if exists opening_event_claims_sequence_check;
alter table public.opening_campaign add column if not exists ends_at timestamptz not null default '2027-01-01 00:00:00+09';
update public.opening_campaign set capacity=10,ends_at='2027-01-01 00:00:00+09',updated_at=now() where id;
alter table public.opening_campaign alter column ends_at drop default;
alter table public.opening_campaign alter column capacity set default 10;
alter table public.opening_campaign add constraint opening_campaign_capacity_check check (capacity = 10);
alter table public.opening_campaign add constraint opening_campaign_used_count_check check (used_count >= 0);
alter table public.opening_event_claims add constraint opening_event_claims_sequence_check check (sequence >= 1);
comment on column public.opening_campaign.ends_at is '행사 종료 시각(이 시각부터 종료). 결제 확정 시점 기준. 2026-12-31 23:59:59 KST 까지 확정된 결제만 쿠폰을 적용한다.';
comment on column public.payments.campaign_discount_amount is '오픈 이벤트 쿠폰 실제 적용액. 신규 확보는 Basic 20,000원 / Plus 25,000원, 기존 20,000·25,000원 거래를 보존한다. 회사 부담, 포인트 중복 불가.';

-- 서비스별 최초 1시간 요금과 같은 고정 쿠폰액. 할증률을 곱하지 않는다. 알 수 없는 서비스는 null.
create or replace function public.opening_event_discount(p_plan text)
returns integer language sql immutable set search_path = '' as $$
  select case p_plan when 'basic' then 20000 when 'plus' then 25000 end;
$$;
revoke all on function public.opening_event_discount(text) from public,anon,authenticated;

-- 행사 종료 여부. 종료 시각 경과 또는 관리자 종료. 캠페인 행이 없으면 종료로 본다.
create or replace function public.opening_event_ended()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select closed_at is not null or now()>=ends_at from public.opening_campaign where id),true);
$$;
revoke all on function public.opening_event_ended() from public,anon,authenticated;

-- 공개 상태에 종료 여부를 더한다. 반환 열이 바뀌어 다시 만든다. 팝업은 종료·소진 시 닫힌다.
drop function if exists public.opening_event_status();
create function public.opening_event_status()
returns table (enabled boolean, remaining integer, ended boolean)
language sql stable security definer set search_path = '' as $$
  select active and integration_ready and closed_at is null and now()<ends_at and used_count<capacity,
    greatest(capacity-used_count,0), closed_at is not null or now()>=ends_at
  from public.opening_campaign where id;
$$;
revoke all on function public.opening_event_status() from public;
grant execute on function public.opening_event_status() to anon, authenticated, service_role;

-- 종료 후에는 이메일 HMAC 을 새로 수집하지 않는다.
create or replace function public.register_opening_event_email(p_customer_id uuid,p_identity_hash text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.opening_event_customer_candidate(p_customer_id)
    or p_identity_hash is null or p_identity_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'verified_email_required' using errcode='23514'; end if;
  perform 1 from public.opening_campaign where id for update;
  if not exists(select 1 from public.opening_campaign where id and active and integration_ready and closed_at is null and now()<ends_at) then
    raise exception 'campaign_unavailable' using errcode='23514'; end if;
  insert into public.opening_event_identities(customer_id,identity_hash,verification_source,verified_at)
    values(p_customer_id,p_identity_hash,'SUPABASE_EMAIL',now())
  on conflict(customer_id) do update set identity_hash=excluded.identity_hash,
    verification_source='SUPABASE_EMAIL',verified_at=now();
end $$;
revoke all on function public.register_opening_event_email(uuid,text) from public,anon,authenticated;
grant execute on function public.register_opening_event_email(uuid,text) to service_role;

-- 106 과 같은 검증 순서에 종료 시각 검사, 서비스별 금액, 확보 만료 상한을 더한다.
create or replace function public.reserve_opening_event(p_payment_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare p public.payments%rowtype; r public.reservations%rowtype;
  c public.opening_campaign%rowtype; identity public.opening_event_identities%rowtype;
  amount integer; hour_amount integer; existing public.opening_event_claims%rowtype;
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
    where state='HELD' and (expires_at<=now() or not public.opening_event_live_hold(payment_id));
  -- 종료 후에는 기존 확보분도 결제로 이어 가지 않는다.
  if now()>=c.ends_at then raise exception 'campaign_ended' using errcode='23514'; end if;
  if c.used_count>=c.capacity then raise exception 'campaign_full' using errcode='23514'; end if;
  if not c.active or not c.integration_ready or c.closed_at is not null then raise exception 'campaign_unavailable' using errcode='23514'; end if;
  select * into existing from public.opening_event_claims where payment_id=p.id;
  -- 전환 전에 확보한 결제는 확보 금액(예: Basic 25,000원)을 유지한다.
  if found and existing.state='HELD' then return existing.discount_amount; end if;
  if exists (select 1 from public.opening_event_claims where payment_id=p.id) then
    raise exception 'claim_expired' using errcode='23514';
  end if;
  select * into identity from public.opening_event_identities where customer_id=r.customer_id;
  if not public.opening_event_customer_eligible(r.customer_id)
    or exists (select 1 from public.opening_event_claims where state in ('HELD','USED')
      and (customer_id=r.customer_id or identity_hash=identity.identity_hash)) then
    raise exception 'campaign_ineligible' using errcode='23514';
  end if;
  if c.used_count+(select count(*) from public.opening_event_claims where state='HELD')>=c.capacity then
    raise exception 'campaign_capacity_held' using errcode='23514';
  end if;
  if p.discount_amount<>0 or exists (select 1 from public.points where payment_id=p.id and reason='USE') then
    raise exception 'campaign_not_stackable' using errcode='23514';
  end if;
  -- 쿠폰액은 예약 서비스의 최초 1시간 요금 고정액이다. 할증률을 곱하지 않는다.
  amount := public.opening_event_discount(r.plan);
  hour_amount := case r.plan when 'plus' then 25000 else 20000 end;
  if amount is null or coalesce(r.duration_minutes,120)<120 or p.gross_amount<=amount
    or p.gross_amount<>round(round(hour_amount*greatest(coalesce(r.duration_minutes,120),120)/60.0)*(1+coalesce(r.surcharge_rate,0))) then
    raise exception 'campaign_invalid_amount' using errcode='23514';
  end if;
  -- 확보 만료는 종료 시각을 넘지 않는다. 종료 시각까지 확정되지 않은 결제는 쿠폰 적용에 실패한다.
  insert into public.opening_event_claims(customer_id,identity_hash,payment_id,reservation_id,discount_amount,expires_at)
    values(r.customer_id,identity.identity_hash,p.id,r.id,amount,least(greatest(r.payment_deadline,now()+interval '10 minutes'),c.ends_at));
  -- 할인은 회사 부담. 정상 지급액을 유지하고 회사 수수료만 줄인다.
  update public.payments set campaign_discount_amount=amount, discount_amount=amount,
    commission_amount=commission_amount-amount where id=p.id;
  return amount;
end $$;
revoke all on function public.reserve_opening_event(uuid) from public, anon, authenticated;
grant execute on function public.reserve_opening_event(uuid) to service_role;

-- finalize_payment 트랜잭션 내부: PG PAID 전이와 예약 확정이 모두 성공해야 사용 순번이 남는다.
-- 종료 시각 검사는 여기서 해야 결제 확정 시점 기준이 된다. 예외를 내면 승인 라우트가 PG 승인을 취소하고
-- 결제를 실패 처리하며, 실패 처리(FAILED)가 확보를 해제해 쿠폰 없이 다시 결제할 수 있다.
create or replace function public.commit_opening_event_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare claim public.opening_event_claims%rowtype; c public.opening_campaign%rowtype; sequence_no integer;
begin
  if new.type<>'BASE' or new.campaign_discount_amount=0 then return new; end if;
  if new.status='PAID' and old.status='PENDING' then
    select * into c from public.opening_campaign where id for update;
    if now()>=c.ends_at then raise exception 'campaign_ended' using errcode='23514'; end if;
    select * into claim from public.opening_event_claims where payment_id=new.id for update;
    if not found or claim.state<>'HELD' or claim.expires_at<=now()
      or new.discount_amount<>claim.discount_amount
      or exists(select 1 from public.points where payment_id=new.id and reason='USE') then raise exception 'campaign_claim_invalid' using errcode='23514'; end if;
    -- 순번·사용 인원은 정원(capacity) 기준이다. 정원보다 큰 기존 순번은 그대로 둔다.
    select min(slot) into sequence_no from generate_series(1,c.capacity) slot
      where not exists(select 1 from public.opening_event_claims where sequence=slot);
    if sequence_no is null then raise exception 'campaign_full' using errcode='23514'; end if;
    update public.opening_campaign set used_count=used_count+1,updated_at=now() where id and used_count<capacity;
    if not found then raise exception 'campaign_full' using errcode='23514'; end if;
    update public.opening_event_claims set state='USED',sequence=sequence_no,confirmed_at=now() where id=claim.id;
  elsif new.status in ('FAILED','CANCELLED') and old.status='PENDING' then
    perform 1 from public.opening_campaign where id for update;
    update public.opening_event_claims set state='RELEASED' where payment_id=new.id and state='HELD';
  end if;
  return new;
end $$;
revoke all on function public.commit_opening_event_payment() from public, anon, authenticated;

-- 관리자 현황에 종료 시각과 종료 여부를 더한다. closed 는 관리자 종료만 뜻한다.
create or replace function public.admin_opening_event(p_search text default '',p_page integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_manage_opening_event() then raise exception 'forbidden' using errcode='42501'; end if;
  perform public.log_access('CAMPAIGN_LIST','opening_event_claims',null,null,'오픈 이벤트 현황 조회');
  select jsonb_build_object('active',c.active,'ready',c.integration_ready,'closed',c.closed_at is not null,
    'ended',c.closed_at is not null or now()>=c.ends_at,'ends_at',c.ends_at,'capacity',c.capacity,
    'used',c.used_count,'held',(select count(*) from public.opening_event_claims where state='HELD' and expires_at>now()),
    'rows',coalesce((select jsonb_agg(to_jsonb(rows)) from (
      select cl.id,b.code,cl.state,cl.sequence,cl.discount_amount,cl.held_at,cl.confirmed_at,cl.restored_at,b.status as reservation_status,
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

-- 소진·종료 후에는 다시 활성화하지 않는다. 정원은 capacity 기준.
create or replace function public.admin_set_opening_event(p_active boolean,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_opening_event() then raise exception 'forbidden' using errcode='42501'; end if;
  if p_active is null or length(trim(coalesce(p_reason,''))) not between 5 and 500 then
    raise exception 'invalid_reason' using errcode='22023'; end if;
  perform 1 from public.opening_campaign where id for update;
  if p_active and not exists(select 1 from public.opening_campaign where id and integration_ready and used_count<capacity and closed_at is null and now()<ends_at) then
    raise exception 'integration_not_ready' using errcode='23514'; end if;
  update public.opening_campaign set active=p_active,updated_at=now() where id;
  perform public.log_access('CAMPAIGN_STATUS','opening_campaign',null,null,p_reason);
end $$;
revoke all on function public.admin_set_opening_event(boolean,text) from public, anon;
grant execute on function public.admin_set_opening_event(boolean,text) to authenticated;

-- 본인 쿠폰함. 확보·사용한 쿠폰은 실제 확보액을, 그 밖에는 예약 서비스가 정해지지 않았으므로
-- discount 를 비우고 서비스별 금액(discounts)을 함께 돌려준다. 종료 시각이 지나면 CLOSED.
create or replace function public.opening_event_coupon()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.opening_campaign%rowtype; identity public.opening_event_identities%rowtype;
  claim public.opening_event_claims%rowtype; coupon_state text; held integer;
  discounts jsonb := jsonb_build_object('basic',public.opening_event_discount('basic'),'plus',public.opening_event_discount('plus'));
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='USER' and status='ACTIVE') then
    return jsonb_build_object('state','HIDDEN','discount',null::integer,'discounts',discounts); end if;
  select * into c from public.opening_campaign where id;
  if not found then return jsonb_build_object('state','HIDDEN','discount',null::integer,'discounts',discounts); end if;
  select * into identity from public.opening_event_identities where customer_id=auth.uid();
  select * into claim from public.opening_event_claims
    where (customer_id=auth.uid() or identity_hash=identity.identity_hash)
      and (state='USED' or (state='HELD' and expires_at>now() and public.opening_event_live_hold(payment_id)))
    order by case state when 'USED' then 0 else 1 end,held_at desc limit 1;
  if claim.state='USED' then
    return jsonb_build_object('state',claim.state,'discount',claim.discount_amount,'discounts',discounts,
      'reservationId',case when claim.customer_id=auth.uid() then claim.reservation_id else null end,
      'remaining',greatest(c.capacity-c.used_count,0));
  end if;
  -- 식별 행 등록이 중지된 회원도 캠페인 중지/종료 안내를 볼 수 있다.
  if c.closed_at is not null or now()>=c.ends_at then
    return jsonb_build_object('state','CLOSED','discount',null::integer,'discounts',discounts); end if;
  if not c.active or not c.integration_ready then
    return jsonb_build_object('state','PAUSED','discount',null::integer,'discounts',discounts); end if;
  if not public.opening_event_customer_eligible(auth.uid()) then
    return jsonb_build_object('state','HIDDEN','discount',null::integer,'discounts',discounts); end if;
  if claim.state='HELD' then
    return jsonb_build_object('state','HELD','discount',claim.discount_amount,'discounts',discounts,
      'reservationId',case when claim.customer_id=auth.uid() then claim.reservation_id else null end,
      'remaining',greatest(c.capacity-c.used_count,0));
  end if;
  select count(*) into held from public.opening_event_claims where state='HELD' and expires_at>now()
    and public.opening_event_live_hold(payment_id);
  coupon_state:=case when c.used_count>=c.capacity then 'EXHAUSTED'
    when c.used_count+held>=c.capacity then 'WAITING' else 'AVAILABLE' end;
  return jsonb_build_object('state',coupon_state,'discount',null::integer,'discounts',discounts,
    'remaining',greatest(c.capacity-c.used_count,0));
end $$;
revoke all on function public.opening_event_coupon() from public,anon;
grant execute on function public.opening_event_coupon() to authenticated;

-- 결제 화면은 이 예약 서비스의 쿠폰액을 보여 준다.
create or replace function public.opening_event_offer(p_reservation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.reservations%rowtype; coupon jsonb; applicable boolean;
begin
  select * into r from public.reservations where id=p_reservation_id and customer_id=auth.uid();
  if not found then raise exception 'not_found' using errcode='42501'; end if;
  coupon:=public.opening_event_coupon();
  applicable:=r.status='MATCHING' and r.confirmed_partner_id is not null and r.payment_deadline>now() and (coupon->>'state'='AVAILABLE'
    or (coupon->>'state'='HELD' and coupon->>'reservationId'=r.id::text));
  -- 재시도의 이전 HELD는 prepare에서 해제한 뒤 이 서비스 금액으로 다시 확보한다.
  return coupon || jsonb_build_object('eligible',coalesce(applicable,false),'discount',public.opening_event_discount(r.plan));
end $$;
revoke all on function public.opening_event_offer(uuid) from public,anon;
grant execute on function public.opening_event_offer(uuid) to authenticated;

-- 069 의 제외 처리. 종료 시각이 지나도 관리자 종료와 같이 막는다.
create or replace function public.admin_exclude_opening_event(p_customer_id uuid,p_excluded boolean,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_opening_event() then raise exception 'forbidden' using errcode='42501'; end if;
  perform 1 from public.opening_campaign where id for update;
  if public.opening_event_ended() then raise exception 'campaign_closed' using errcode='23514'; end if;
  if p_excluded is null or length(trim(coalesce(p_reason,''))) not between 5 and 500
    or not exists(select 1 from public.profiles where id=p_customer_id and role='USER') then
    raise exception 'invalid_input' using errcode='22023'; end if;
  if p_excluded then
    insert into public.opening_event_exclusions(customer_id,reason,recorded_by)
      values(p_customer_id,trim(p_reason),auth.uid()) on conflict(customer_id)
      do update set reason=excluded.reason,recorded_by=auth.uid(),recorded_at=now();
  else delete from public.opening_event_exclusions where customer_id=p_customer_id; end if;
  update public.opening_event_identities set excluded=p_excluded where customer_id=p_customer_id;
  perform public.log_access('CAMPAIGN_EXCLUSION','opening_event_exclusions',p_customer_id,p_customer_id,trim(p_reason));
end $$;
revoke all on function public.admin_exclude_opening_event(uuid,boolean,text) from public,anon;
grant execute on function public.admin_exclude_opening_event(uuid,boolean,text) to authenticated;

-- 069 의 귀책 복원. 종료 후에는 재사용할 수 없으므로 복원하지 않는다.
create or replace function public.admin_restore_opening_event(p_claim_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare cl public.opening_event_claims%rowtype; pay public.payments%rowtype; refunded integer;
begin
  if not public.can_manage_opening_event() then raise exception 'forbidden' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'invalid_reason' using errcode='22023'; end if;
  perform 1 from public.opening_campaign where id for update;
  if public.opening_event_ended() then raise exception 'campaign_closed' using errcode='23514'; end if;
  select * into cl from public.opening_event_claims where id=p_claim_id for update;
  if not found or cl.state<>'USED' then raise exception 'claim_not_restorable' using errcode='23514'; end if;
  if not exists(select 1 from public.reservations where id=cl.reservation_id and status='CANCELLED') then raise exception 'cancellation_required' using errcode='23514'; end if;
  select * into pay from public.payments where id=cl.payment_id;
  if not found or pay.status<>'PAID' or pay.type<>'BASE' then raise exception 'paid_base_required' using errcode='23514'; end if;
  select coalesce(-sum(gross_amount-discount_amount),0) into refunded from public.payments
    where reservation_id=cl.reservation_id and type='REFUND' and status='PAID';
  if refunded < pay.gross_amount-pay.discount_amount then raise exception 'full_cash_refund_required' using errcode='23514'; end if;
  -- 회사/파트너 귀책은 담당자가 증빙 대조 후 사유로 확인한다. 고객 취소 자동 복원 없음.
  update public.opening_event_claims set state='RELEASED',restored_at=now(),
    restored_sequence=sequence,restored_confirmed_at=confirmed_at,restored_by=auth.uid(),
    restored_reason=trim(p_reason),sequence=null,confirmed_at=null where id=cl.id;
  update public.opening_campaign set used_count=used_count-1,updated_at=now() where id;
  perform public.log_access('CAMPAIGN_PROVIDER_FAULT_RESTORE','opening_event_claims',cl.id,cl.customer_id,trim(p_reason));
end $$;
revoke all on function public.admin_restore_opening_event(uuid,text) from public,anon;
grant execute on function public.admin_restore_opening_event(uuid,text) to authenticated;

-- 069 의 HMAC 파기. 관리자 종료뿐 아니라 종료 시각 경과 후에도 관련 처리가 끝나면 파기한다.
create or replace function public.purge_closed_opening_event_identities()
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  perform 1 from public.opening_campaign where id for update;
  if not public.opening_event_ended()
    or exists(select 1 from public.opening_event_claims cl join public.reservations r on r.id=cl.reservation_id
      where r.status not in ('COMPLETED','CANCELLED'))
    or exists(select 1 from public.refund_requests rr join public.opening_event_claims cl on cl.reservation_id=rr.reservation_id
      where rr.status in ('PENDING','APPROVED'))
    or exists(select 1 from public.payments p join public.opening_event_claims cl on cl.reservation_id=p.reservation_id
      where p.status='PENDING')
    or exists(select 1 from public.payment_incidents pi join public.opening_event_claims cl on cl.payment_id=pi.payment_id
      where pi.status::text<>'RESOLVED') then return 0; end if;
  delete from public.opening_event_identities;
  get diagnostics affected=row_count;
  delete from public.opening_event_exclusions;
  update public.opening_event_claims set identity_hash=null where identity_hash is not null;
  return affected;
end $$;
revoke all on function public.purge_closed_opening_event_identities() from public,anon,authenticated;
grant execute on function public.purge_closed_opening_event_identities() to service_role;

-- 082 의 예외 판정. 행사 종료 후에는 혜택을 재사용할 수 없으므로 제공 불가 판정에 복원을 요구하지 않고,
-- 복원도 허용하지 않는다. 그 밖의 검증은 082 와 같다.
create or replace function public.admin_plan_service_exception(p_service uuid,p_decision text,
 p_final_cash integer,p_partner_payout integer,p_reason text,p_evidence text,p_restore boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare s public.services; p public.payments; cash integer; remaining integer;
 take integer; extra uuid:=gen_random_uuid(); token text:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
begin
 if not public.can_manage_settlements() then raise exception 'forbidden' using errcode='42501'; end if;
 select * into s from public.services where id=p_service for update;
 if s.id is null or s.status<>'ENDED' or s.no_show or s.termination_kind not in ('PROVIDER_FAULT','EMERGENCY')
  then raise exception 'not_reviewable' using errcode='23514'; end if;
 if p_decision is null or p_decision not in ('UNAVAILABLE','PARTIAL','EMERGENCY')
  or (s.termination_kind='EMERGENCY' and p_decision<>'EMERGENCY')
  or (s.termination_kind='PROVIDER_FAULT' and p_decision='EMERGENCY')
  or (s.started_at is null and p_decision<>'UNAVAILABLE')
  or p_final_cash is null or p_final_cash not between 0 and 10000000
  or p_partner_payout is null or p_partner_payout not between 0 and 10000000
  or (p_decision='UNAVAILABLE' and p_final_cash<>0)
  or length(trim(coalesce(p_reason,''))) not between 5 and 500
  or length(trim(coalesce(p_evidence,''))) not between 5 and 500
  or p_restore is null or (p_restore and p_decision<>'UNAVAILABLE')
  then raise exception 'invalid_decision' using errcode='22023'; end if;
 if p_restore then perform 1 from public.opening_campaign where id for update; end if;
 perform 1 from public.reservations where id=s.reservation_id for update;
 perform 1 from public.payments where reservation_id=s.reservation_id order by id for update;
 if exists(select 1 from public.service_exception_resolutions where service_id=s.id)
  or exists(select 1 from public.settlements where service_id=s.id)
  or exists(select 1 from public.refund_requests where reservation_id=s.reservation_id)
  or exists(select 1 from public.payments where reservation_id=s.reservation_id and
    (status='PENDING' or (type='REFUND' and status='PAID')))
  or (select count(*) from public.payments where reservation_id=s.reservation_id and type='BASE' and status='PAID')<>1
  or (select count(*) from public.payments where reservation_id=s.reservation_id and status='PAID')>20
  then raise exception 'existing_financial_processing_requires_reconciliation' using errcode='23514'; end if;
 select coalesce(sum(gross_amount-discount_amount),0)::integer into cash from public.payments
  where reservation_id=s.reservation_id and status='PAID';
 if cash<0 then raise exception 'invalid_cash'; end if;
 if p_restore and (not exists(select 1 from public.opening_event_claims cl join public.payments pay on pay.id=cl.payment_id
    where cl.reservation_id=s.reservation_id and cl.state='USED' and pay.type='BASE' and pay.status='PAID')
   or public.opening_event_ended())
  then raise exception 'benefit_not_restorable'; end if;
 if p_decision='UNAVAILABLE' and not p_restore and not public.opening_event_ended() and exists(select 1 from public.opening_event_claims
   where reservation_id=s.reservation_id and state='USED') then raise exception 'benefit_restoration_required'; end if;
 insert into public.service_exception_resolutions(service_id,decision,cash_before,final_cash,partner_payout,reason,evidence_reference,restore_benefit,decided_by)
 values(s.id,p_decision,cash,p_final_cash,p_partner_payout,trim(p_reason),trim(p_evidence),p_restore,auth.uid());
 remaining:=greatest(cash-p_final_cash,0);
 for p in select * from public.payments where reservation_id=s.reservation_id and status='PAID'
   order by paid_at desc nulls last,id loop
  take:=least(remaining,p.gross_amount-p.discount_amount);
  insert into public.service_exception_transactions(service_id,payment_id,cash,target_balance,commission_before,payout_before)
   values(s.id,p.id,p.gross_amount-p.discount_amount,p.gross_amount-p.discount_amount-take,p.commission_amount,p.payout_amount);
  remaining:=remaining-take;
 end loop;
 if p_final_cash>cash then
  insert into public.service_exception_transactions(service_id,payment_id,cash,target_balance,additional)
   values(s.id,extra,p_final_cash-cash,p_final_cash-cash,true);
  -- 신규 결제를 같은 트랜잭션에서 등록하므로 FK 검사를 지연한다.
  insert into public.payments(id,reservation_id,type,status,order_id,gross_amount,commission_amount,payout_amount,
    pay_token,token_expires_at,charge_reason,review_required)
   values(extra,s.reservation_id,'EXTENSION','PENDING','EX-'||extra::text,p_final_cash-cash,p_final_cash-cash,0,
     token,now()+interval '3 days','EXTENSION',false);
  insert into public.notifications(recipient_id,type,title,body,link,dedupe_key)
   select customer_id,'PAYMENT_ADDITIONAL','운영 확인 후 추가 결제 안내',
    '서비스 종료 내용을 확인한 추가 결제입니다. 금액을 확인해 주세요.','/pay/'||token,'exception-charge:'||s.id::text
    from public.reservations where id=s.reservation_id;
 end if;
 perform public.log_access('SERVICE_EXCEPTION_DECISION','services',s.id,s.partner_id,trim(p_reason)||' / 증빙: '||trim(p_evidence));
end $$;
revoke all on function public.admin_plan_service_exception(uuid,text,integer,integer,text,text,boolean) from public,anon;
grant execute on function public.admin_plan_service_exception(uuid,text,integer,integer,text,text,boolean) to authenticated;

-- 082 의 예외 상세. 복원 가능 여부(eventRestorable)를 더해 종료 후에는 복원 선택지를 숨긴다.
create or replace function public.admin_get_service_exception(p_service uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.services; r public.reservations;
begin
 if not public.can_manage_settlements() then raise exception 'forbidden' using errcode='42501'; end if;
 if length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'invalid_reason'; end if;
 select * into s from public.services where id=p_service;
 if s.id is null or s.termination_kind not in ('PROVIDER_FAULT','EMERGENCY') then raise exception 'not_exception'; end if;
 select * into r from public.reservations where id=s.reservation_id;
 perform public.log_access('SERVICE_EXCEPTION_DETAIL','services',s.id,s.partner_id,trim(p_reason));
 return jsonb_build_object('serviceId',s.id,'code',r.code,'kind',s.termination_kind,
  'startedAt',s.started_at,'endedAt',s.ended_at,'actorId',auth.uid(),
  'decision',(select to_jsonb(d) from public.service_exception_resolutions d where service_id=s.id),
  'cashPaid',(select coalesce(sum(gross_amount-discount_amount),0) from public.payments where reservation_id=r.id and status='PAID'),
  'eventUsed',exists(select 1 from public.opening_event_claims where reservation_id=r.id and state='USED'),
  'eventRestorable',exists(select 1 from public.opening_event_claims where reservation_id=r.id and state='USED')
    and not public.opening_event_ended(),
  'transactions',(select coalesce(jsonb_agg(jsonb_build_object('paymentId',p.id,'orderId',p.order_id,
    'transactionId',p.transaction_id,'cash',t.cash,'targetBalance',t.target_balance,'status',p.status,
    'refund',t.cash-t.target_balance,'additional',t.additional)), '[]'::jsonb)
    from public.service_exception_transactions t join public.payments p on p.id=t.payment_id where t.service_id=s.id));
end $$;
revoke all on function public.admin_get_service_exception(uuid,text) from public,anon;
grant execute on function public.admin_get_service_exception(uuid,text) to authenticated;

-- 082 의 예외 확정. 복원을 계획한 뒤 행사가 끝났으면 복원하지 않고 결정에도 미복원으로 남긴다.
-- 고객 요약(restored)·관리자 화면이 실제 처리와 같게 보인다. 그 밖의 처리는 082 와 같다.
create or replace function public.record_service_exception_resolution(p_service uuid,p_actor uuid,p_verified jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare s public.services; d public.service_exception_resolutions; tx record; v jsonb;
 base_id uuid; refunded integer; net_cash integer; customer uuid;
begin
 if not exists(select 1 from public.profiles p join public.admin_accounts a on a.profile_id=p.id
   join auth.users u on u.id=p.id
   where p.id=p_actor and p.role='ADMIN' and p.status='ACTIVE' and a.duty in ('전체','정산')
    and coalesce((u.raw_app_meta_data->>'must_change_password')::boolean,false)=false)
  then raise exception 'forbidden' using errcode='42501'; end if;
 select * into s from public.services where id=p_service for update;
 select * into d from public.service_exception_resolutions where service_id=p_service for update;
 if d.service_id is null then raise exception 'decision_required'; end if;
 if d.resolved_at is not null then return; end if;
 if s.status<>'ENDED' or s.no_show then raise exception 'invalid_service_state'; end if;
 perform 1 from public.reservations where id=s.reservation_id for update;
 perform 1 from public.payments where reservation_id=s.reservation_id order by id for update;
 if jsonb_typeof(p_verified) is distinct from 'array'
  or jsonb_array_length(p_verified)<>(select count(*) from public.service_exception_transactions where service_id=s.id)
  or exists(select 1 from public.payments p where p.reservation_id=s.reservation_id and p.status='PAID'
    and not exists(select 1 from public.service_exception_transactions t where t.payment_id=p.id and t.service_id=s.id))
  or exists(select 1 from public.payments where reservation_id=s.reservation_id and status='PENDING')
  or exists(select 1 from public.refund_requests where reservation_id=s.reservation_id)
  or exists(select 1 from public.settlements where service_id=s.id)
  then raise exception 'financial_state_changed'; end if;
 for tx in select x.*,p.order_id,p.transaction_id,p.gross_amount,p.discount_amount,p.status,p.type
  from public.service_exception_transactions x join public.payments p on p.id=x.payment_id where x.service_id=s.id loop
  select value into v from jsonb_array_elements(p_verified) where value->>'paymentId'=tx.payment_id::text;
  if v is null or tx.status<>'PAID' or tx.gross_amount-tx.discount_amount<>tx.cash
   or v->>'orderId' is distinct from tx.order_id
   or v->>'transactionId' is distinct from tx.transaction_id
   or (v->>'cash')::integer is distinct from tx.cash
   or (v->>'balance')::integer is distinct from tx.target_balance
   then raise exception 'pg_verification_mismatch'; end if;
 end loop;
 -- 보류 해제·환불 원장·최종 정산·완료·알림을 하나의 트랜잭션에서 처리한다.
 update public.service_exception_resolutions set resolved_at=now(),resolved_by=p_actor where service_id=s.id;
 for tx in select x.*,p.reservation_id from public.service_exception_transactions x join public.payments p on p.id=x.payment_id where x.service_id=s.id loop
  refunded:=tx.cash-tx.target_balance;
  if refunded>0 then
   insert into public.payments(reservation_id,type,status,order_id,gross_amount,discount_amount,commission_amount,payout_amount,paid_at)
    values(s.reservation_id,'REFUND','PAID','EX-'||tx.payment_id::text,-refunded,0,-refunded,0,now());
  end if;
 end loop;
 select payment_id into base_id from public.service_exception_transactions t join public.payments p on p.id=t.payment_id
  where t.service_id=s.id and p.type='BASE';
 -- 승인 총액·할인은 보존한다. 분배만 확정하고 환불로 지급액을 이중 차감하지 않는다.
 update public.payments set payout_amount=case when id=base_id then d.partner_payout else 0 end,
   commission_amount=gross_amount-discount_amount-case when id=base_id then d.partner_payout else 0 end
  where reservation_id=s.reservation_id and status='PAID' and type<>'REFUND';
 select sum(gross_amount-discount_amount)::integer into net_cash from public.payments where reservation_id=s.reservation_id and status='PAID';
 if net_cash<>d.final_cash or (select sum(payout_amount) from public.payments where reservation_id=s.reservation_id and status='PAID')<>d.partner_payout then raise exception 'ledger_mismatch'; end if;
 insert into public.settlements(service_id,partner_id,amount,fee,net,payment_id,reason)
  values(s.id,s.partner_id,net_cash,net_cash-d.partner_payout,d.partner_payout,base_id,'SERVICE_EXCEPTION');
 update public.reservations set final_amount=d.final_cash,status=case when d.decision='UNAVAILABLE' then 'CANCELLED'::public.reservation_status else 'COMPLETED'::public.reservation_status end
  where id=s.reservation_id returning customer_id into customer;
 if d.decision='UNAVAILABLE' then perform public.release_points(base_id); end if;
 if d.restore_benefit then
  perform 1 from public.opening_campaign where id for update;
  if public.opening_event_ended() then
   update public.service_exception_resolutions set restore_benefit=false where service_id=s.id;
  else
   update public.opening_event_claims set state='RELEASED',restored_at=now(),restored_by=p_actor,
    restored_reason=d.reason||' / 증빙: '||d.evidence_reference,restored_sequence=sequence,restored_confirmed_at=confirmed_at,sequence=null,confirmed_at=null
    where reservation_id=s.reservation_id and state='USED';
   if found then update public.opening_campaign set used_count=used_count-1,updated_at=now() where id; end if;
  end if;
 end if;
 update public.services set status='COMPLETED' where id=s.id;
 insert into public.notifications(recipient_id,type,title,body,link,dedupe_key)
  values(customer,'SERVICE_EXCEPTION_RESOLVED','서비스 종료 확인이 완료되었어요',
   '최종 현금 청구액 '||d.final_cash||'원, 현금 환불액 '||greatest(d.cash_before-d.final_cash,0)||'원으로 확인되었습니다.',
   '/mypage/reservations/'||s.reservation_id::text,'exception-resolved:'||s.id::text);
 -- 서버 JWT에는 auth.uid()가 없으므로 실제 검증 담당자를 명시해 기록한다.
 insert into public.access_logs(actor_id,actor_role,subject_id,action,target_table,target_id,reason)
 values(p_actor,'ADMIN',s.partner_id,'SERVICE_EXCEPTION_RESOLVE','services',s.id,
  d.reason||' / 증빙: '||d.evidence_reference||' / 현금: '||d.final_cash||' / 지급: '||d.partner_payout);
end $$;
revoke all on function public.record_service_exception_resolution(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_service_exception_resolution(uuid,uuid,jsonb) to service_role;
