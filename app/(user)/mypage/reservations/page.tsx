import { redirect } from "next/navigation";

/**
 * `/mypage/reservations` → `/mypage`
 *
 *  예약 목록 화면은 `/mypage` 다. `reservations` 밑에는 예약별 상세(`[id]`)만
 *  있어서 이 경로는 원래 404 였다.
 *
 *  그런데 이 주소를 가리키는 링크가 **이미 밖에 나가 있다.** 알림은 생성
 *  시점의 link 문자열을 DB 에 저장하므로, 코드를 고쳐도 그 전에 발송된
 *  알림은 옛 주소를 그대로 들고 있다(#107 이후 실제로 404 가 났다).
 *  북마크나 공유된 주소도 마찬가지다.
 *
 *  목록을 여기에 새로 만들면 `/mypage` 와 두 벌이 된다. 받아서 넘긴다.
 */
export default function ReservationsIndex() {
    redirect("/mypage");
}
