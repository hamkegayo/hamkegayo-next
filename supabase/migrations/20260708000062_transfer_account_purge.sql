-- 개인정보처리방침 제4조: 정산정보 목적 달성 후 지체 없이 파기.
-- 지급 결과 반영 기능이 배치 상태를 완료/취소로 바꾸면 같은 트랜잭션에서 원문 파기.
alter table public.transfer_batch_items alter column account_number drop not null;

create or replace function public.purge_terminal_transfer_accounts()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status in ('COMPLETED', 'CANCELLED') and new.status not in ('COMPLETED', 'CANCELLED') then
    raise exception 'terminal_batch_cannot_reopen' using errcode = '23514';
  end if;
  if new.status in ('COMPLETED', 'CANCELLED') then
    update public.transfer_batch_items set account_number = null where batch_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.purge_terminal_transfer_accounts() from public, anon, authenticated;
create trigger trg_purge_terminal_transfer_accounts
  after update of status on public.transfer_batches
  for each row execute function public.purge_terminal_transfer_accounts();

-- 이미 끝난 배치도 계좌번호 원문을 파기한다. 끝 4자리와 거래 금액만 이력에 남긴다.
update public.transfer_batch_items bi set account_number = null
  from public.transfer_batches b where b.id = bi.batch_id and b.status in ('COMPLETED', 'CANCELLED');
comment on column public.transfer_batch_items.account_number is
  '이체 파일 생성용 계좌번호 원문. 배치 완료/취소 시 즉시 NULL로 파기. 끝 4자리만 이력 보관.';
