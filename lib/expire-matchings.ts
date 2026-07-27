import { createAdminClient } from "@/utils/supabase/admin";

/**
 * 진료일시가 지난 미확정(MATCHING) 예약을 CANCELLED 로 정리한다(lazy).
 *  - 예약 목록/현황 조회 직전에 호출해 방치된 유령 예약을 만료시킨다.
 *  - service_role(admin)로 security-definer RPC 를 호출(소유자 무관 처리).
 *  - 실패해도 조회는 계속되도록 best-effort(에러 무시).
 */
export async function expirePastMatchings(): Promise<void> {
    try {
        const admin = createAdminClient();
        await admin.rpc("expire_past_matchings");
    } catch {
        // best-effort: 만료 실패가 조회를 막지 않도록 무시
    }
}
