/**
 * 사업자 정보 — 전자상거래법 제10조 표시사항.
 *
 *  ⚠️ **여기가 유일한 출처다.** 푸터와 약관 부칙이 같은 값을 읽는다.
 *     PG 심사는 "PG 에 제출한 사업자정보 = 사이트 하단 사업자정보" 가
 *     같을 것을 요구한다. 두 곳에 따로 적으면 반드시 어긋난다.
 *
 *  값은 이용약관 부칙 표와 개인정보처리방침 제14조를 따른다.
 */
export type CompanyInfo = {
    name: string;
    ceo: string;
    businessNumber: string;
    /**
     * 통신판매업 신고번호.
     *
     * 아직 발급 전이라 `null` 이다. 신규 사업자라 직전연도 거래횟수가
     * 50회 미만이므로 공정위 「통신판매업 신고 면제 기준에 대한 고시」상
     * 신고 **면제 대상**이지만, 면제는 의무 면제일 뿐 신고 자체는 가능하다.
     * 신고번호를 받으면 이 값만 채우면 푸터·약관 부칙에 함께 반영된다(#52).
     */
    mailOrderNumber: string | null;
    address: string;
    tel: string;
    /** 약관 제13조 ③ — 서비스 운영시간과 같은 값이어야 한다 */
    hours: string;
    email: string;
    /**
     * 카카오톡 문의 아이디.
     *
     * 개인정보처리방침 제14조가 문의 방법으로 공개하는 창구다. 방침이
     * 공개한 창구를 화면에서 빼 두면 이용자는 방침을 보고 찾아오는데
     * 고객센터에는 없는 상태가 된다.
     */
    kakao: string;
    /**
     * 카카오톡 채널 주소.
     *
     * `kakao` 는 아이디라 화면에 적어도 눌러서 갈 수 없다. 처리방침 제14조가
     * 문의 방법으로 공개한 창구인 이상 실제로 닿아야 한다.
     */
    kakaoUrl: string;
    /** 개인정보처리방침 제14조 */
    privacyOfficer: string;
};

export const COMPANY: CompanyInfo = {
    name: "함께가요",
    ceo: "김서현",
    businessNumber: "821-16-02842",
    mailOrderNumber: null,
    address: "강원특별자치도 원주시 남산로 77, 3층 3122호(일산동)",
    tel: "010-9345-2328",
    hours: "06:00~18:00",
    email: "hamkegayo@gmail.com",
    kakao: "hamkegayo",
    kakaoUrl: "https://pf.kakao.com/_fImBX",
    privacyOfficer: "김서현 대표",
};

/** 신고번호 표기. 발급 전에는 "신고 예정" 으로 표시한다. */
export function mailOrderLabel(): string {
    return COMPANY.mailOrderNumber ?? "신고 예정";
}
