/** 파트너 프로필(My 프로필) 목업 데이터 */

export type VerificationRow = { label: string; value: string };

export type WorkHistoryRow = {
    hospital: string;
    period: string;
    duration: string;
    dept: string;
    role: string;
};

export type QualificationIcon =
    "license" | "education" | "insurance" | "record";

export type Qualification = {
    id: string;
    icon: QualificationIcon;
    title: string;
    detail: string;
};

export const PARTNER_PROFILE = {
    name: "박소연",
    role: "간호사",
    companionYears: 6,
    intro: "10년 이상 간호사 경력을 보유하고 있으며, 고객의 병원 동행 서비스를 전문적으로 수행합니다. 환자와 보호자분들께 신뢰와 편안함을 드리는 것이 제 목표입니다.",

    verification: [
        { label: "이름", value: "박소연" },
        { label: "생년월일", value: "1990.03.15" },
        { label: "직군/전문 분야", value: "간호사" },
        { label: "간호사 경력", value: "12년 6개월" },
        { label: "병원 동행 경력", value: "6년" },
        { label: "주요 근무 병원", value: "서울아산병원 외 3곳" },
    ] as VerificationRow[],

    /** 활동 지역 — checked 여부 포함 */
    regions: [
        { label: "강남구", checked: true },
        { label: "서초구", checked: true },
        { label: "송파구", checked: true },
        { label: "성남시 분당구", checked: true },
        { label: "기타 지역", checked: false },
    ],

    times: [
        { label: "평일 오전 (09:00 ~ 12:00)", checked: true },
        { label: "평일 오후 (13:00 ~ 18:00)", checked: true },
        { label: "평일 저녁 (18:00 ~ 21:00)", checked: true },
        { label: "토요일 (09:00 ~ 18:00)", checked: true },
        { label: "일요일", checked: false },
    ],

    transports: [
        { label: "대중교통", checked: true },
        { label: "자동차", checked: true },
        { label: "택시 동행 가능", checked: true },
    ],

    mobilityAssist: [
        { label: "부축 보행 가능", checked: true },
        { label: "휠체어 이용자 지원 가능", checked: true },
        { label: "병원 내 이동 보조 가능", checked: true },
    ],

    preferredHospitals: [
        "서울아산병원",
        "삼성서울병원",
        "세브란스병원",
        "분당서울대병원",
    ],

    workHistory: [
        {
            hospital: "서울아산병원",
            period: "2018.03 ~ 2021.03",
            duration: "3년 1개월",
            dept: "내과 병동",
            role: "병동 간호, 환자 케어",
        },
        {
            hospital: "삼성서울병원",
            period: "2015.03 ~ 2018.02",
            duration: "3년 0개월",
            dept: "외과 병동",
            role: "수술 전후 간호",
        },
        {
            hospital: "세브란스병원",
            period: "2012.07 ~ 2015.02",
            duration: "2년 7개월",
            dept: "응급실",
            role: "응급 환자 처치 및 간호",
        },
        {
            hospital: "분당서울대병원",
            period: "2010.03 ~ 2012.06",
            duration: "2년 4개월",
            dept: "소아과 병동",
            role: "소아 환자 간호",
        },
    ] as WorkHistoryRow[],

    qualifications: [
        {
            id: "q-license",
            icon: "license",
            title: "간호사 면허",
            detail: "등록번호 RN-2025-123456    취득일 2012.02.20",
        },
        {
            id: "q-education",
            icon: "education",
            title: "응급처치 교육",
            detail: "수료일 2025.04.01",
        },
        {
            id: "q-insurance",
            icon: "insurance",
            title: "배상책임보험",
            detail: "가입일 2025.01.15    (현) 삼성화재",
        },
        {
            id: "q-record",
            icon: "record",
            title: "범죄 경력 조회",
            detail: "조회일 2025.01.10",
        },
    ] as Qualification[],

    /** 자격 추가 모달 자격 종류 선택지 */
    qualificationTypes: [
        "간호조무사 자격증",
        "요양보호사 자격증",
        "심폐소생술(CPR) 자격",
        "치매전문교육 이수증",
        "기타",
    ],
};
