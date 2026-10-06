/** 파트너 프로필(My 프로필) 공용 타입과 선택지 */

export type QualificationIcon =
    "license" | "education" | "insurance" | "record";

export type Qualification = {
    id: string;
    icon: QualificationIcon;
    title: string;
    detail: string;
};

// 활동 정보 목업(지역·시간·이동수단·보행 보조·선호 병원)은 실제 저장으로 바꿨다 (#226).
// 값과 선택지는 lib/partner-activity.ts 에 있다.
export const PARTNER_PROFILE = {
    /** 자격 추가 모달 자격 종류 선택지 */
    qualificationTypes: [
        "간호조무사 자격증",
        "요양보호사 자격증",
        "심폐소생술(CPR) 자격",
        "치매전문교육 이수증",
        "기타",
    ],
};
