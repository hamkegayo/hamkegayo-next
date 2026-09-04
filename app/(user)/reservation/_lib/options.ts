/** 예약 폼 셀렉트 옵션 (합리적 기본값) */

/** 09:00 ~ 18:00, 30분 단위 → "9시 30분" 형식 */
export const TIME_OPTIONS: string[] = (() => {
    const out: string[] = [];
    for (let h = 9; h <= 18; h++) {
        for (const m of [0, 30]) {
            if (h === 18 && m === 30) break;
            out.push(`${h}시 ${String(m).padStart(2, "0")}분`);
        }
    }
    return out;
})();

/**
 * 예상 소요 시간 (2시간 ~ 4시간, 30분 단위).
 * 예약 최소 단위는 2시간이다 — 선결제가 2시간분이므로(약관 제21조 ①)
 * 그보다 짧은 예약은 받지 않는다. 실제 이용이 짧게 끝나면 최소 1시간까지
 * 미달분을 환불한다(약관 제11조 ②③).
 */
export const DURATION_OPTIONS: string[] = [
    "2시간",
    "2시간 30분",
    "3시간",
    "3시간 30분",
    "4시간",
];

/** 이용자와의 관계 */
export const RELATION_OPTIONS: string[] = [
    "본인",
    "배우자",
    "자녀",
    "부모",
    "형제 / 자매",
    "친척",
    "기타",
];

/** 결제수단 */
export const PAY_METHODS: { value: string; label: string }[] = [
    { value: "card", label: "카드" },
    { value: "bank", label: "무통장" },
];

/** 결제 카드사 */
export const CARD_COMPANIES: string[] = [
    "신한카드",
    "삼성카드",
    "현대카드",
    "국민카드",
    "우리카드",
    "하나카드",
    "롯데카드",
    "BC카드",
    "농협카드",
];

/** 할부 기간 */
export const INSTALLMENTS: string[] = [
    "일시불",
    "2개월",
    "3개월",
    "4개월",
    "5개월",
    "6개월",
    "12개월",
];

/**
 * 거동 상태 — 민감정보(처리방침 제3조 ①).
 * 매칭 전 파트너에게 수행 가능 여부 판단용으로 제공된다 (제5조 ④).
 */
export const MOBILITY_OPTIONS: string[] = [
    "스스로 보행 가능",
    "지팡이 사용",
    "보행기(워커) 사용",
    "부축 필요",
    "휠체어 이용",
];

/** 인지 상태 — 민감정보. 제공 근거는 거동 상태와 같다. */
export const COGNITIVE_OPTIONS: string[] = [
    "의사소통 원활",
    "가벼운 기억력 저하",
    "인지 저하 있음 (반복 안내 필요)",
    "보호자 동반 필요",
];
