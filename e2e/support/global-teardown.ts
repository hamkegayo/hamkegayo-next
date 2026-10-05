import { E2E_HOSPITAL_PREFIX } from "./accounts";
import { deleteE2eReservations } from "./local-supabase";

/** 이번 실행이 만든 예약·결제 등 테스트 개인정보를 남기지 않는다. */
export default async function globalTeardown() {
    const deleted = await deleteE2eReservations(E2E_HOSPITAL_PREFIX);
    console.log(`[e2e] 테스트 예약 ${deleted}건과 연결 데이터를 정리했습니다.`);
}
