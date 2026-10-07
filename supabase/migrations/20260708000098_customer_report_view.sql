-- =============================================================
-- 고객 보호자 리포트 열람 — #253
--
--  리포트 제출 시 고객에게 "보호자 리포트가 도착했어요" 알림이 가지만 고객이 볼 경로가 없었다.
--  reports RLS 는 파트너 본인 조회만 허용하므로, 예약 소유자에게 필요한 열만 내보내는 RPC 를 둔다
--  (동의 여부에 따른 열 숨김은 RLS 행 단위로 할 수 없다 — 파트너 1단계 노출과 같은 방식).
--
--  근거 (게시된 원문 lib/legal — 노션 원문은 갱신 전)
--   - 처리방침 제1조 3호 : 서비스 수행기록 및 리포트 제공
--   - 약관 제8조 ①③ : 진료내용 전달 여부는 실제 이용자의 의사에 따르고, 원하지 않으면 전달하지 않는다
--   - 처리방침 제10조 ④ : 진료·검사 내용, 사진 또는 서비스 기록 등을 보호자·예약자에게 전달하는 경우
--                         이용자가 동의한 범위에서만 전달한다
--   - 처리방침 제4조 : 리포트 민감정보 부분 3년 후 파기(sensitive_data_purged_at)
--
--  반환 범위
--   - 예약 소유자(customer_id = auth.uid()) 만. 제출(SUBMITTED) 리포트만. DRAFT 는 없는 것과 같다.
--   - 항상 : 수행 지원 내용(supports), 보호자 전달사항(guardian_note), 제출 시각
--   - 진료내용 전달 동의(share_medical_info) 또는 본인 예약(relation = '본인')일 때만 :
--       검사 진행 내용(exam), 첨부 목록(처방전·영수증·검사예약증·사진 등)
--   - 파기된 리포트는 purged = true 와 빈 본문만.
--   - 첨부 실파일은 서버가 짧은 서명 URL 로 내준다(경로만 반환).
--   - 조회할 때마다 접근 기록(REPORT_VIEW_CUSTOMER)을 남긴다(사용자 결정 2026-10-07).
--
--  * 여러 번 실행해도 안전(idempotent).
-- =============================================================

create or replace function public.get_own_report(p_reservation uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res     public.reservations;
  v_report  public.reports;
  v_shared  boolean;
  v_purged  boolean;
  v_files   jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_res from public.reservations
   where id = p_reservation and customer_id = auth.uid();
  if not found then
    return null;  -- 없는 예약과 남의 예약을 구분하지 않는다
  end if;

  select rp.* into v_report
    from public.reports rp
    join public.services s on s.id = rp.service_id
   where s.reservation_id = v_res.id
     and rp.status = 'SUBMITTED'::public.report_status;
  if not found then
    return null;
  end if;

  -- 약관 제8조 · 처리방침 제10조 ④ — 본인 예약이면 예약자가 곧 이용자다.
  v_shared := coalesce(v_res.share_medical_info, false) or v_res.relation = '본인';
  v_purged := v_report.sensitive_data_purged_at is not null;

  if v_shared and not v_purged then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', a.id, 'kind', a.kind, 'filename', a.filename,
             'size', a.size, 'path', a.path) order by a.created_at), '[]'::jsonb)
      into v_files
      from public.report_attachments a
     where a.report_id = v_report.id;
  end if;

  perform public.log_access('REPORT_VIEW_CUSTOMER', 'reports', v_report.id, v_res.customer_id,
                            '고객 보호자 리포트 열람');

  return jsonb_build_object(
    'report_id',      v_report.id,
    'submitted_at',   v_report.submitted_at,
    'purged',         v_purged,
    'medical_shared', v_shared,
    'supports',       case when v_purged then '[]'::jsonb else to_jsonb(v_report.supports) end,
    'guardian_note',  case when v_purged then null else v_report.guardian_note end,
    'exam',           case when v_purged or not v_shared then null else v_report.exam end,
    'attachments',    v_files
  );
end;
$$;

comment on function public.get_own_report(uuid) is
  '예약 소유자에게 제출된 보호자 리포트를 반환한다. 진료 메모·첨부는 진료내용 전달 동의(또는 본인 예약) 시에만. 조회마다 접근 기록. (#253)';

revoke all on function public.get_own_report(uuid) from public, anon;
grant execute on function public.get_own_report(uuid) to authenticated;
