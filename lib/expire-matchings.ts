import { createAdminClient } from "@/utils/supabase/admin";

/**
 * 만료 정리 lazy 호출 — **폴백이다** (#65).
 *
 *  정기 정리는 Supabase pg_cron 이 5분마다 `run_expiry_sweep()` 을 부른다
 *  (마이그레이션 20260708000026). 이 함수는 크론이 멈췄을 때를 위한 보조이고,
 *  조회 직전에 호출해 화면에 유령 예약·만료된 파트너 선택이 남지 않게 한다.
 *
 *  Vercel Hobby 는 하루 1회 크론만 허용해서 30분 기한에 쓸 수 없다.
 *  그래서 크론이 Vercel 이 아니라 DB 쪽에 있다.
 */

/**
 * 최소 실행 간격(ms). 호출부가 목록 조회마다 부르는데, 파트너 화면이
 * 15초 주기로 자동 갱신하면서 UPDATE 가 그만큼 반복되므로 간격을 둔다.
 * 만료 판정은 분 단위라 1분이면 체감 차이가 없다.
 */
const MIN_INTERVAL_MS = 60_000;

/** 마지막 실행 시각 (서버 인스턴스별. 정확한 분산 제어가 목적이 아니라 과호출 방지용) */
let lastRunAt = 0;

/**
 * 만료된 파트너 선택 해제와 진료일시 경과 예약 취소를 한 번에 처리한다.
 *  - service_role(admin)로 security-definer RPC 를 호출(소유자 무관 처리).
 *  - 마지막 실행 후 1분이 지나지 않았으면 건너뛴다(자동 갱신 폴링 대비).
 *  - 실패해도 조회는 계속되도록 best-effort(에러 무시).
 */
export async function runExpirySweep(): Promise<void> {
    const now = Date.now();
    if (now - lastRunAt < MIN_INTERVAL_MS) return;
    lastRunAt = now;

    try {
        const admin = createAdminClient();
        await admin.rpc("run_expiry_sweep");
    } catch {
        // best-effort: 만료 실패가 조회를 막지 않도록 무시
    }
}
