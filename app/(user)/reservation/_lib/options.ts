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

/** 예상 소요 시간 (1시간 ~ 4시간, 30분 단위) */
export const DURATION_OPTIONS: string[] = [
    "1시간",
    "1시간 30분",
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
