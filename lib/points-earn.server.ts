import { createAdminClient } from "@/utils/supabase/admin";

/**
 * 결제 포인트 적립 (#249) — 서버 전용.
 *
 * 최종 정산이 끝난 예약에 결제 금액의 1% 를 한 번 적립한다. 조건 판정·금액 계산·
 * 중복 방지·고객 알림은 모두 DB 함수(earn_reservation_points)가 한다.
 *
 * 서비스 완료 직후 바로 부르기 위한 것이다. 추가결제·환불이 남아 있으면 0 이 나오고,
 * 끝난 뒤 10분 주기 cron(point-earn-sweep)이 마무리한다. 그래서 실패해도 완료 처리를
 * 막지 않는다.
 */
export async function earnReservationPoints(
    reservationId: string,
): Promise<number> {
    try {
        const admin = createAdminClient();
        const { data, error } = await admin.rpc("earn_reservation_points", {
            p_reservation_id: reservationId,
        });
        if (error) {
            console.error("[earnReservationPoints] 적립 실패:", error.message);
            return 0;
        }
        return typeof data === "number" ? data : 0;
    } catch (e) {
        console.error("[earnReservationPoints] 적립 실패:", e);
        return 0;
    }
}
