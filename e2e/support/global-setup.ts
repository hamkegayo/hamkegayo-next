import { E2E_HOSPITAL_PREFIX } from "./accounts";
import { localSupabaseAdmin } from "./local-supabase";

/**
 * 이전 실행이 남긴 E2E 예약이 시드 파트너의 일정을 잡고 있으면 선택이 거절된다
 * (partner_unavailable). 테스트가 만든 예약(병원명 E2E병원*)만 취소한다.
 * 계정은 `npm run seed:dev` · `npm run seed:admin` 이 만든다.
 */
export default async function globalSetup() {
    const { error } = await localSupabaseAdmin()
        .from("reservations")
        .update({ status: "CANCELLED" })
        .like("hospital_name", `${E2E_HOSPITAL_PREFIX}%`)
        .in("status", ["MATCHING", "CONFIRMED"]);
    if (error) throw error;
}
