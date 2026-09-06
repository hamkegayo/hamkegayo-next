-- =============================================================
-- 파트너 정산 계좌 (#51)
--
--  지금까지 무슨 일이 벌어지고 있었나
--    정산 계좌를 저장할 곳이 없다. settlements 는 쌓이는데 받을 계좌가
--    DB 밖에 있어, 첫 정산일에 담당자가 파트너에게 따로 물어봐야 한다.
--    그러면 **계좌번호가 카톡·메모에 남는다.** #50 이 세운 원칙
--    ("계좌번호는 막는 게 아니라 기록하고 연다")이 DB 밖에서는 적용되지 않는다.
--
--  설계 — care_recipients 가 아니라 #50 의 admin_get_reservation 을 따른다
--    계좌번호는 업무상 **반드시 열람해야 하는** 항목이다. 이체 파일을 만들려면
--    누군가는 전체 번호를 봐야 한다. 그래서 "막는다" 가 아니라 다음으로 간다.
--      · 테이블에 RLS 를 켜되 **정책을 하나도 두지 않는다** → 직접 조회 불가
--      · 평상시 경로(본인 확인·관리자 목록)는 **뒷 4자리만** 본다
--      · 전체 번호는 사유를 적어야 열리고, 그 사실이 access_logs 에 남는다
--
--  뒷 4자리를 따로 저장하는 이유
--    마스킹을 보여 주려고 전체 번호를 읽어 오면, 화면을 열 때마다 열람
--    기록이 쌓이거나 — 더 나쁘게는 — 기록 없는 조회가 상시로 생긴다.
--    표시용 값을 분리해 두면 평상시 경로가 전체 번호에 닿지 않는다.
--
--  ⚠️ 배포 전 개인정보처리방침 개정이 필요하다(2026-09-06 확인).
--     현재 방침 제2조 "처리하는 개인정보의 항목" 표에 **계좌 관련 항목이 없다.**
--     제1조는 처리 목적으로 "파트너 정산" 을 들고 있지만 항목이 빠져 있어,
--     이대로 수집하면 공개한 항목 밖의 정보를 받게 된다.
--     → 제2조 표에 "정산 정보 : 은행명, 계좌번호, 예금주명" 한 행,
--        제4조 표에 보유기간 한 행이 추가되어야 한다.
-- =============================================================

create table if not exists public.partner_payouts (
  partner_id     uuid primary key references public.profiles (id) on delete cascade,
  -- 금융결제원 표준 기관코드 3자리. 은행명이 바뀌어도 코드는 그대로다.
  bank_code      text not null,
  -- 저장 시점의 은행명. 코드가 목록에서 사라져도 과거 값을 읽을 수 있어야 한다.
  bank_name      text not null,
  account_number text not null,
  -- 표시 전용. 이 값 덕분에 평상시 경로가 전체 번호에 닿지 않는다.
  account_last4  text not null,
  holder_name    text not null,
  -- 예금주 검증(1원 인증 등) 완료 시각. 도입 전까지 항상 null 이다.
  verified_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.partner_payouts is
  '파트너 정산 계좌(#51). RLS 정책을 두지 않아 직접 조회가 불가능하다. 뒷 4자리는 RPC 로 자유롭게, 전체 번호는 사유와 함께 열리며 access_logs 에 남는다.';
comment on column public.partner_payouts.account_last4 is
  '마스킹 표시용 뒷 4자리. 목록·본인 확인 화면이 전체 번호를 읽지 않게 하려고 따로 둔다.';
comment on column public.partner_payouts.verified_at is
  '예금주 검증 완료 시각. 1원 인증 도입 전까지 null — 예금주 불일치가 이체 실패의 주원인이다.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.partner_payouts'::regclass
       and conname = 'partner_payouts_format_check'
  ) then
    alter table public.partner_payouts add constraint partner_payouts_format_check
      check (
        account_number ~ '^[0-9]{8,20}$'
        and account_last4 ~ '^[0-9]{4}$'
        and bank_code ~ '^[0-9]{3}$'
        and length(btrim(holder_name)) between 2 and 20
      );
  end if;
end;
$$;

-- ⚠️ 정책을 하나도 두지 않는다. anon·authenticated 는 한 행도 읽지 못한다.
alter table public.partner_payouts enable row level security;

drop trigger if exists trg_partner_payouts_updated_at on public.partner_payouts;
create trigger trg_partner_payouts_updated_at
  before update on public.partner_payouts
  for each row execute function public.set_updated_at();

-- =============================================================
-- ① 본인 계좌 등록·변경
--
--  뒷 4자리는 여기서 만든다. 앱이 넘기게 하면 전체 번호와 어긋난 값이
--  들어올 수 있고, 그 어긋남은 이체 사고가 나기 전까지 드러나지 않는다.
--
--  계좌를 바꾸면 검증 상태가 풀린다 — 검증한 것은 이전 계좌였다.
-- =============================================================
create or replace function public.upsert_my_payout_account(
  p_bank_code      text,
  p_bank_name      text,
  p_account_number text,
  p_holder_name    text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_role   public.user_role;
  v_status public.account_status;
  v_digits text := regexp_replace(coalesce(p_account_number, ''), '[^0-9]', '', 'g');
  v_holder text := btrim(coalesce(p_holder_name, ''));
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select role, status into v_role, v_status
    from public.profiles where id = v_uid;

  -- 파트너만 정산 계좌를 가진다. 이용자에게는 받을 돈이 없다.
  if v_role is distinct from 'PARTNER'::public.user_role
     or v_status is distinct from 'ACTIVE'::public.account_status then
    raise exception 'not_partner' using errcode = '42501';
  end if;

  if v_digits !~ '^[0-9]{8,20}$' then
    raise exception 'invalid_account' using errcode = 'P0001';
  end if;
  if length(v_holder) < 2 or length(v_holder) > 20 then
    raise exception 'invalid_holder' using errcode = 'P0001';
  end if;
  if p_bank_code !~ '^[0-9]{3}$' or btrim(coalesce(p_bank_name, '')) = '' then
    raise exception 'invalid_bank' using errcode = 'P0001';
  end if;

  insert into public.partner_payouts as t (
    partner_id, bank_code, bank_name, account_number, account_last4, holder_name
  ) values (
    v_uid, p_bank_code, btrim(p_bank_name), v_digits, right(v_digits, 4), v_holder
  )
  on conflict (partner_id) do update
    set bank_code = excluded.bank_code,
        bank_name = excluded.bank_name,
        account_number = excluded.account_number,
        account_last4 = excluded.account_last4,
        holder_name = excluded.holder_name,
        -- 계좌가 바뀌면 이전 검증은 의미가 없다.
        verified_at = case
          when t.account_number is distinct from excluded.account_number
            then null
          else t.verified_at
        end;

  -- 본인 계좌라도 변경 사실은 남긴다. 이체 실패를 되짚을 때 필요하다.
  perform public.log_access(
    'UPDATE', 'partner_payouts', v_uid, v_uid, '본인 정산 계좌 등록·변경'
  );

  return jsonb_build_object('last4', right(v_digits, 4));
end;
$$;

comment on function public.upsert_my_payout_account(text, text, text, text) is
  '본인 정산 계좌를 등록·변경한다(#51). 뒷 4자리는 서버가 만든다. 계좌가 바뀌면 예금주 검증이 풀린다. 파트너 본인만.';

revoke all on function public.upsert_my_payout_account(text, text, text, text)
  from public, anon;
grant execute on function public.upsert_my_payout_account(text, text, text, text)
  to authenticated;

-- =============================================================
-- ② 본인 계좌 확인 — **마스킹된 것만**
--
--  본인이라도 전체 번호를 다시 볼 이유가 없다. 틀렸으면 새로 입력하면 된다.
--  전체 번호를 되돌려 주는 경로를 만들면 화면 캡처·어깨너머로 새는 표면이
--  하나 더 생긴다.
-- =============================================================
create or replace function public.get_my_payout_account()
returns table (
  bank_code   text,
  bank_name   text,
  last4       text,
  holder_name text,
  verified_at timestamptz,
  updated_at  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.bank_code, p.bank_name, p.account_last4, p.holder_name,
         p.verified_at, p.updated_at
    from public.partner_payouts p
   where p.partner_id = auth.uid();
$$;

comment on function public.get_my_payout_account() is
  '본인 정산 계좌를 마스킹된 형태로 조회한다(#51). 전체 계좌번호는 돌려주지 않는다.';

revoke all on function public.get_my_payout_account() from public, anon;
grant execute on function public.get_my_payout_account() to authenticated;

-- =============================================================
-- ③ 관리자 목록 — 마스킹만
--
--  누가 등록했고 누가 아직인지가 정산일 전에 필요한 정보다. 그 판단에
--  전체 번호는 필요 없다.
-- =============================================================
create or replace function public.admin_list_payout_accounts()
returns table (
  partner_id   uuid,
  partner_name text,
  bank_name    text,
  last4        text,
  holder_name  text,
  verified_at  timestamptz,
  updated_at   timestamptz,
  /** 지급 대기 정산금(원). 계좌가 급한 사람을 위에 올리기 위한 값 */
  pending_net  integer
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
  select pr.id,
         pr.name,
         pp.bank_name,
         pp.account_last4,
         pp.holder_name,
         pp.verified_at,
         pp.updated_at,
         coalesce((
           select sum(s.net)::integer
             from public.settlements s
            where s.partner_id = pr.id
              and s.status = 'PENDING'::public.settlement_status
         ), 0)
    from public.profiles pr
    left join public.partner_payouts pp on pp.partner_id = pr.id
   where pr.role = 'PARTNER'::public.user_role
     and pr.status = 'ACTIVE'::public.account_status
   -- 계좌가 없는데 줄 돈이 있는 사람이 가장 급하다.
   order by (pp.partner_id is null) desc, 8 desc, pr.name;
end;
$$;

comment on function public.admin_list_payout_accounts() is
  '파트너 정산 계좌 목록(관리자). 마스킹된 뒷 4자리까지만 내려간다 — 목록을 보는 데 전체 번호는 필요 없다.';

revoke all on function public.admin_list_payout_accounts() from public, anon;
grant execute on function public.admin_list_payout_accounts() to authenticated;

-- =============================================================
-- ④ 전체 계좌번호 열람 — 사유를 적어야 열린다
--
--  #50 의 admin_get_reservation(id, reason) 과 같은 형태다. 이체 파일을
--  만들 때는 전체 번호가 필요하고, 그 필요를 부정하지 않는다. 대신
--  **언제 누가 왜 열었는지가 남는다.**
--  근거 : 「개인정보의 안전성 확보조치 기준」 제8조 ① — 접속기록 2년 보관
-- =============================================================
create or replace function public.admin_reveal_payout_account(
  p_partner_id uuid,
  p_reason     text
)
returns table (
  bank_code      text,
  bank_name      text,
  account_number text,
  holder_name    text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 재인증(aal2)까지 요구한다. 세션을 주워도 계좌번호까지는 못 간다.
  if not public.is_admin_live() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 사유 없는 열람은 없다. 빈 문자열로 우회하지 못하게 길이를 본다.
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  perform public.log_access(
    'READ', 'partner_payouts', p_partner_id, p_partner_id, btrim(p_reason)
  );

  return query
  select p.bank_code, p.bank_name, p.account_number, p.holder_name
    from public.partner_payouts p
   where p.partner_id = p_partner_id;
end;
$$;

comment on function public.admin_reveal_payout_account(uuid, text) is
  '전체 계좌번호를 사유와 함께 열람한다(#51). 재인증한 관리자만 가능하며 열람 사실이 access_logs 에 남는다. 이체 파일 생성 시점에만 쓴다.';

revoke all on function public.admin_reveal_payout_account(uuid, text) from public, anon;
grant execute on function public.admin_reveal_payout_account(uuid, text) to authenticated;
