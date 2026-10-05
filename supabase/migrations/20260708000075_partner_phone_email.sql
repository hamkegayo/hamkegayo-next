-- #64: 등록 이메일로 연락처 변경을 승인한다. 휴대폰 소유 인증은 아니다.
-- 개인정보처리방침 제1조 회원 인증 목적. OTP는 5분, 원문은 저장하지 않는다.
create table public.partner_phone_changes (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.profiles(id) on delete cascade,
  email_hash text not null,
  phone text not null check (phone ~ '^010[0-9]{8}$'),
  code_hash text not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes',
  consumed_at timestamptz
);
alter table public.partner_phone_changes enable row level security;
revoke all on public.partner_phone_changes from anon, authenticated;
create index on public.partner_phone_changes(partner_id, created_at desc);

create function public.request_partner_phone_change(p_partner uuid, p_phone text, p_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_email text; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_partner::text, 75));
  select lower(trim(p.email)) into v_email from public.profiles p
    join public.partner_accounts a on a.profile_id=p.id
    where p.id=p_partner and p.role='PARTNER' and p.status='ACTIVE' for update of p;
  if v_email is null or v_email like '%@partner.hamkegayo.internal' or not exists (
    select 1 from public.email_verifications e where e.email=v_email and e.consumed_at is not null
  ) then return jsonb_build_object('ok',false,'message','먼저 연락용 이메일을 등록하고 인증해 주세요.'); end if;
  if p_phone !~ '^010[0-9]{8}$' or p_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('ok',false,'message','올바른 휴대폰 번호를 입력해 주세요.'); end if;
  if exists (select 1 from public.partner_phone_changes where partner_id=p_partner and created_at>now()-interval '60 seconds')
    or (select count(*) from public.partner_phone_changes where partner_id=p_partner and created_at>now()-interval '1 day')>=10 then
    return jsonb_build_object('ok',false,'message','발송 횟수 제한입니다. 잠시 후 다시 시도해 주세요.'); end if;
  delete from public.partner_phone_changes where created_at<now()-interval '1 day';
  update public.partner_phone_changes set consumed_at=now() where partner_id=p_partner and consumed_at is null;
  insert into public.partner_phone_changes(partner_id,email_hash,phone,code_hash)
    values(p_partner,encode(sha256(convert_to(v_email,'UTF8')),'hex'),p_phone,p_hash) returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id,'email',v_email);
end; $$;

create function public.verify_partner_phone_change(p_partner uuid, p_id uuid, p_phone text, p_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.partner_phone_changes; v_email text;
begin
  select lower(trim(email)) into v_email from public.profiles where id=p_partner and role='PARTNER' and status='ACTIVE' for update;
  select * into v from public.partner_phone_changes where id=p_id and partner_id=p_partner for update;
  if v.id is null or v.consumed_at is not null or v.expires_at<=now() or v.attempts>=5
    or v.phone is distinct from p_phone or v.email_hash is distinct from encode(sha256(convert_to(v_email,'UTF8')),'hex') then
    return jsonb_build_object('ok',false,'message','인증 요청이 만료되었거나 변경되었습니다. 다시 요청해 주세요.'); end if;
  update public.partner_phone_changes set attempts=attempts+1 where id=v.id;
  if v.code_hash is distinct from p_hash then return jsonb_build_object('ok',false,'message','인증번호가 일치하지 않습니다.'); end if;
  update public.profiles set phone=v.phone, phone_verified_at=null where id=p_partner;
  update public.partner_phone_changes set consumed_at=now() where id=v.id;
  return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.request_partner_phone_change(uuid,text,text), public.verify_partner_phone_change(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.request_partner_phone_change(uuid,text,text), public.verify_partner_phone_change(uuid,uuid,text,text) to service_role;
