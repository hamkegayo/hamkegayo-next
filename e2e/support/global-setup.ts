import { E2E_HOSPITAL_PREFIX } from "./accounts";
import { deleteE2eReservations } from "./local-supabase";

/**
 * 중단된 이전 실행이 남긴 E2E 예약을 지우고 시작한다. 남아 있으면 시드 파트너의
 * 일정이 겹쳐 선택이 거절되고(partner_unavailable), 테스트 개인정보가 쌓인다.
 * 계정은 `npm run seed:dev` · `npm run seed:admin` 이 만든다.
 */
export default async function globalSetup() {
    await deleteE2eReservations(E2E_HOSPITAL_PREFIX);
}
