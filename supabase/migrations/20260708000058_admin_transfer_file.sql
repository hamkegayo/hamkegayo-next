-- #56 이체 파일 발급 및 배치 잠금.
-- 개인정보처리방침 제2조·제4조: 계좌번호는 정산정보이며 정산·거래 이력은 5년 보존한다.
-- 파일 자체는 서버에 저장하지 않고, MFA를 마친 정산 담당자의 발급 이력만 남긴다.

alter table public.transfer_batches
  add column issued_by uuid references public.profiles (id),
  add column issued_at timestamptz,
  add column last_downloaded_at timestamptz;

comment on column public.transfer_batches.issued_by is
  '이체 파일 최초 발급자. 배치 생성자와 달라야 한다.';
comment on column public.transfer_batches.last_downloaded_at is
  '민감한 계좌정보가 포함된 파일의 마지막 다운로드 시각.';

create or replace function public.admin_issue_transfer_file(
  p_batch_id uuid, p_reason text
)
returns table (
  batch_code text,
  item_id uuid,
  bank_code text,
  bank_name text,
  account_number text,
  holder_name text,
  amount integer,
  memo text
)
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.transfer_batch_status;
  v_creator uuid;
  v_issuer uuid;
begin
  if not public.can_manage_settlements() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 5 and 500 then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;

  select b.status, b.created_by, b.issued_by
    into v_status, v_creator, v_issuer
    from public.transfer_batches b
   where b.id = p_batch_id
   for update;
  if not found then
    raise exception 'batch_not_found' using errcode = 'P0002';
  end if;
  if v_status not in (
       'DRAFT'::public.transfer_batch_status,
       'FILE_ISSUED'::public.transfer_batch_status
     ) then
    raise exception 'batch_not_issuable' using errcode = '23514';
  end if;
  -- 배치 생성과 계좌 원문 반출을 한 사람이 모두 수행하지 못하게 한다.
  if v_creator = auth.uid() then
    raise exception 'second_admin_required' using errcode = '42501';
  end if;
  -- 재다운로드도 최초 발급자에게만 허용해 계좌번호 접근자를 늘리지 않는다.
  if v_issuer is not null and v_issuer <> auth.uid() then
    raise exception 'issuer_mismatch' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.transfer_batch_items bi
     where bi.batch_id = p_batch_id
       and (
         bi.bank_name ~ '^[[:space:]]*[=+@-]'
         or bi.holder_name ~ '^[[:space:]]*[=+@-]'
       )
  ) then
    raise exception 'unsafe_csv_value' using errcode = '23514';
  end if;

  update public.transfer_batches
     set status = 'FILE_ISSUED'::public.transfer_batch_status,
         issued_by = coalesce(issued_by, auth.uid()),
         issued_at = coalesce(issued_at, now()),
         last_downloaded_at = now()
   where id = p_batch_id;

  perform public.log_access(
    'TRANSFER_FILE_DOWNLOAD', 'transfer_batches', p_batch_id, null,
    btrim(p_reason)
  );

  return query
  select b.code, bi.id, bi.bank_code, bi.bank_name, bi.account_number,
         bi.holder_name, bi.amount,
         left('함께가요 ' || b.code, 20)
    from public.transfer_batches b
    join public.transfer_batch_items bi on bi.batch_id = b.id
   where b.id = p_batch_id
   order by bi.partner_id;
end;
$$;

comment on function public.admin_issue_transfer_file(uuid, text) is
  'MFA 정산 담당자가 이체 CSV를 발급한다. 배치 생성자와 발급자를 분리하고 모든 다운로드를 기록한다.';

revoke all on function public.admin_issue_transfer_file(uuid, text)
  from public, anon;
grant execute on function public.admin_issue_transfer_file(uuid, text)
  to authenticated;
