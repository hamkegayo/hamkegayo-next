-- #185 사용자 실제 할인 활성화 승인(2026-10-05).
-- 적용 순서: 공개 고지 배포 + 환경별 HMAC 키 설정 + 기존 거래 대조 후 이 파일 적용.
-- 운영 확인 완료/제외 계정 추가 없음은 사용자 확인. 기존 제외 목록은 보존한다.
-- 기존 종료/사용/확보 기록을 초기화하거나 종료 행사를 재개하지 않는다.
do $$
begin
  if not exists(select 1 from public.opening_campaign where id and closed_at is null) then
    raise exception 'campaign_closed_or_missing';
  end if;
  update public.opening_campaign set integration_ready=true,active=true,updated_at=now() where id;
end $$;
