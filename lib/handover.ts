/**
 * 수행 조건 — 이동·귀가·종료방식·인계 (#77, 서버/클라 공용).
 *
 *  근거는 파트너 현장업무 매뉴얼(개정일 26.08.31)이다. 1장이 이렇게 정한다.
 *
 *    "예약 화면에 만남 장소, 이동수단, 귀가수단, 종료방식,
 *     미도착·인계 실패 종료시각 또는 결과보고 경로가 없고 운영센터에서도
 *     확인되지 않으면 업무를 시작하지 않는다."
 *
 *  ⚠️ 라벨은 **매뉴얼 표현을 그대로** 쓴다. 화면 문구와 DB 값이 갈라지면
 *     파트너가 보는 말과 우리가 저장한 말이 달라진다.
 */

// =============================================================
// 이동수단 · 귀가수단
//
//  매뉴얼 2장과 대응카드 10·11 이 금지한 두 가지는 **선택지에 넣지 않는다.**
//    · 파트너 개인차량으로 이용자를 운송하는 것
//    · 이용자·보호자 차량을 파트너가 대신 운전하는 것
//  고를 수 없어야 현장에서 "예약에 그렇게 돼 있다" 는 말이 나오지 않는다.
// =============================================================

export type TransportCode = "WALK" | "PUBLIC" | "TAXI" | "FAMILY_CAR";

export const TRANSPORT_OPTIONS: { value: TransportCode; label: string }[] = [
    { value: "WALK", label: "도보" },
    { value: "PUBLIC", label: "대중교통 (버스·지하철)" },
    { value: "TAXI", label: "택시" },
    // 매뉴얼 2장 — "예약 화면 또는 운영센터에서 운전자로 확인된 이용자·보호자가
    // 운전하는 차량에 동승" 만 허용된다. 파트너는 운전하지 않는다.
    { value: "FAMILY_CAR", label: "이용자·보호자가 운전하는 차량 동승" },
];

export const TRANSPORT_LABEL: Record<TransportCode, string> =
    Object.fromEntries(
        TRANSPORT_OPTIONS.map((o) => [o.value, o.label]),
    ) as Record<TransportCode, string>;

// =============================================================
// 종료방식
//
//  매뉴얼 용어정의 그대로 둘뿐이다. 긴급 인계(병원 직원·구급대원·경찰관 인수)는
//  예약 시점에 고를 수 있는 방식이 아니라 정상 인계가 불가능할 때의 예외
//  절차이므로(대응카드 18) 선택지에 넣지 않는다.
// =============================================================

export type EndMethodCode = "ADULT_HANDOVER" | "INDEPENDENT";

export const END_METHOD_OPTIONS: { value: EndMethodCode; label: string }[] = [
    { value: "ADULT_HANDOVER", label: "성인 인계 — 지정한 분께 인계 후 종료" },
    { value: "INDEPENDENT", label: "독립 귀가 — 이용자 혼자 귀가" },
];

export const END_METHOD_LABEL: Record<EndMethodCode, string> = {
    ADULT_HANDOVER: "성인 인계",
    INDEPENDENT: "독립 귀가",
};

// =============================================================
// 통보대상
//
//  매뉴얼 용어정의 — "예약 화면에서 도착·지연·진행상황을 알릴 사람으로
//  지정된 이용자 또는 보호자".
// =============================================================

export type NotifyTargetCode = "USER" | "GUARDIAN" | "BOTH";

export const NOTIFY_TARGET_OPTIONS: {
    value: NotifyTargetCode;
    label: string;
}[] = [
    { value: "BOTH", label: "이용자와 보호자 모두" },
    { value: "USER", label: "이용자에게만" },
    { value: "GUARDIAN", label: "보호자에게만" },
];

export const NOTIFY_TARGET_LABEL: Record<NotifyTargetCode, string> = {
    USER: "이용자",
    GUARDIAN: "보호자",
    BOTH: "이용자·보호자",
};

// =============================================================
// 대기 기준 — **예약별 입력값이 아니다**
// =============================================================

/**
 * 이용자 미도착 시 파트너 대기시간(분).
 *
 * 약관 제15조 ③④ 가 20분으로 정한다. 예약마다 다르게 받으면 약관과
 * 어긋나므로 입력받지 않고 이 값으로 계산해 화면에 표시한다.
 */
export const NO_SHOW_WAIT_MIN = 20;

/**
 * 인계자 미도착 시 파트너 대기시간(분).
 *
 * 대응카드 18 은 "예약 화면의 인계 실패 종료시각까지 기다린다" 고만 하고
 * 약관에도 기준이 없었다. 미도착과 같은 20분으로 확정했다(2026-09-05 기획).
 */
export const HANDOVER_FAIL_WAIT_MIN = 20;

/**
 * 결과보고 경로.
 *
 * 매뉴얼 14단계는 "운영센터가 지정한 결과보고 경로" 라 하고, 3장 표가 그것을
 * 파트너 페이지의 리포트 작성으로 정한다. **예약마다 다를 수 없다.**
 */
export const REPORT_CHANNEL = "파트너 페이지 > 리포트 작성";
