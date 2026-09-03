import { createAdminClient } from "@/utils/supabase/admin";

/**
 * 최소 실행 간격(ms). 호출부가 목록 조회마다 부르는데, 파트너 화면이
 * 15초 주기로 자동 갱신하면서 UPDATE 가 그만큼 반복되므로 간격을 둔다.
 * 만료 판정은 분 단위라 1분이면 체감 차이가 없다.
 */
const MIN_INTERVAL_MS = 60_000;

/** 마지막 실행 시각 (서버 인스턴스별. 정확한 분산 제어가 목적이 아니라 과호출 방지용) */
let lastRunAt = 0;

/**
 * 진료일시가 지난 미확정(MATCHING) 예약을 CANCELLED 로 정리한다(lazy).
 *  - 예약 목록/현황 조회 직전에 호출해 방치된 유령 예약을 만료시킨다.
 *  - service_role(admin)로 security-definer RPC 를 호출(소유자 무관 처리).
 *  - 마지막 실행 후 1분이 지나지 않았으면 건너뛴다(자동 갱신 폴링 대비).
 *  - 실패해도 조회는 계속되도록 best-effort(에러 무시).
 */
export async function expirePastMatchings(): Promise<void> {
    const now = Date.now();
    if (now - lastRunAt < MIN_INTERVAL_MS) return;
    lastRunAt = now;

    try {
        const admin = createAdminClient();
        await admin.rpc("expire_past_matchings");
    } catch {
        // best-effort: 만료 실패가 조회를 막지 않도록 무시
    }
}
