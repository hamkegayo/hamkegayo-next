-- #186 리뷰: 이벤트 노쇼 선결제/환불 원장 정합성, 공개 후기 최소 열,
-- 건강 정보 구체 표현 일반화 및 공개 고지 확정 전 파트너 상세 서버 차단.
-- 적용된 63·65·69의 이력은 수정하지 않고 이 보정으로 처리한다.
create or replace function public.create_settlement_on_complete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.reservations%rowtype; p public.payments%rowtype; gross integer;
  discount integer:=0; fee integer; amount integer; rate numeric;
begin
  if new.status='COMPLETED' and old.status is distinct from new.status then
    select * into r from public.reservations where id=new.reservation_id;
    select * into p from public.payments where reservation_id=new.reservation_id and type='BASE'
      and status='PAID' order by paid_at desc nulls last,id limit 1;
    gross:=coalesce(r.final_amount,r.prepaid_amount,case r.plan when 'plus' then 25000 else 20000 end);
    rate:=coalesce(r.fee_rate,case r.plan when 'plus' then 0.24 else 0.20 end);
    if coalesce(p.campaign_discount_amount,0)>0 and not new.no_show then
      gross:=p.gross_amount; discount:=p.campaign_discount_amount; rate:=p.commission_rate;
    elsif coalesce(p.campaign_discount_amount,0)>0 and new.no_show then
      -- 노쇼는 무료시간 보조금을 제거하되 이미 수납한 현금 원장은 보존한다.
      -- 최종 1시간 요금과의 차액은 record_settlement_refund가 한 번 차감한다.
      -- gross-discount-commission=payout 제약은 예약시간/할증과 무관하게 유지된다.
      gross:=p.gross_amount-p.discount_amount; rate:=p.commission_rate;
      update public.payments set commission_amount=round(gross*rate),
        payout_amount=gross-round(gross*rate) where id=p.id;
    end if;
    fee:=round(gross*rate)-discount; amount:=gross-discount;
    insert into public.settlements(service_id,partner_id,amount,fee,net,payment_id,reason)
      values(new.id,new.partner_id,amount,fee,amount-fee,p.id,'SERVICE_COMPLETED') on conflict do nothing;
  end if;
  return new;
end $$;

-- 내부 source_key/동의 확인/생성 시각은 REST 직접 조회로 노출하지 않는다.
revoke select on public.imported_reviews from anon, authenticated;
-- 공개는 get_public_reviews RPC의 명시적인 필드만 사용한다.
update public.imported_reviews set title='병원 동행 감사합니다'
  where source_key='provided-pdf-20261004-05';
update public.imported_reviews set title='병원 일정 동행', content=
  '아버지의 병원 일정에 동행이 필요해 이용했습니다. 평일이라 가족들이 시간을 내기가 어려웠는데 일정 전부터 끝날 때까지 같이 있어주셨어요. 일정이 끝난 뒤에도 옆에서 챙겨주시고 귀가하실 때까지 도와주셔서 감사했습니다. 처음 이용이라 걱정했는데 잘 마무리했습니다.'
  where source_key='provided-pdf-20261004-08';

-- 정본 확정은 별도 검토 후 마이그레이션으로 승인한다. 고객/파트너/관리자
-- 클라이언트가 이 플래그를 변경할 수 없으며 기본은 비공개다.
create table public.partner_public_release (
  id boolean primary key default true check(id),
  enabled boolean not null default false
);
insert into public.partner_public_release(id) values(true);
alter table public.partner_public_release enable row level security;
revoke all on public.partner_public_release from public,anon,authenticated;
grant all on public.partner_public_release to service_role;
create function public.partner_public_details_enabled()
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select enabled from public.partner_public_release where id),false);
$$;
revoke all on function public.partner_public_details_enabled() from public;
grant execute on function public.partner_public_details_enabled() to authenticated,service_role;

alter function public.get_reservation_partner_detail(uuid,uuid) rename to get_reservation_partner_detail_unreleased;
revoke all on function public.get_reservation_partner_detail_unreleased(uuid,uuid) from public,anon,authenticated;
create function public.get_reservation_partner_detail(p_reservation_id uuid,p_partner_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.partner_public_details_enabled() then
    raise exception 'partner_public_release_pending' using errcode='42501';
  end if;
  return public.get_reservation_partner_detail_unreleased(p_reservation_id,p_partner_id);
end $$;
revoke all on function public.get_reservation_partner_detail(uuid,uuid) from public,anon;
grant execute on function public.get_reservation_partner_detail(uuid,uuid) to authenticated;

alter function public.set_partner_public_consent(boolean) rename to set_partner_public_consent_unreleased;
revoke all on function public.set_partner_public_consent_unreleased(boolean) from public,anon,authenticated;
create function public.set_partner_public_consent(p_consent boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_consent and not public.partner_public_details_enabled() then
    raise exception 'partner_public_release_pending' using errcode='42501';
  end if;
  -- 기존 동의의 철회는 비공개 상태에서도 허용한다.
  perform public.set_partner_public_consent_unreleased(p_consent);
end $$;
revoke all on function public.set_partner_public_consent(boolean) from public,anon;
grant execute on function public.set_partner_public_consent(boolean) to authenticated;
