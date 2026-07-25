/** 파트너 서비스 요청(수락 대기) 목업 데이터 */

export type ScheduleStep = {
    no: string;
    kind: "home" | "hospital" | "pharmacy";
    label: string;
    time: string;
};

export type PartnerRequest = {
    id: string;
    plan: "Basic" | "Plus";
    hospital: string;
    type: string;
    // 목록 표시
    listTime: string;
    duration: string;
    // 요약
    hospitalTime: string;
    hospitalDate: string;
    arriveTime: string;
    arriveDate: string;
    estDuration: string;
    amount: number;
    responseBy: string;
    // 서비스 정보
    code: string;
    serviceType: string;
    departure: string;
    schedule: ScheduleStep[];
    // 고객 정보
    customer: {
        name: string;
        age: string;
        gender: string;
        treatment: string;
        purpose: string;
        cautions: string[];
        requests: string[];
    };
};

const COMMON_CAUTIONS = [
    "보행 보조가 필요하여 천천히 이동합니다.",
    "오래 서 있거나 걷는 것이 힘들어 중간에 휴식이 필요할 수 있습니다.",
    "계단 이동이 어렵습니다. 엘리베이터 이용을 부탁드립니다.",
    "혈압약을 복용 중이며, 컨디션에 따라 어지러움을 느낄 수 있습니다.",
    "대기 시간이 길어질 경우 불안감을 느낄 수 있습니다.",
];

const COMMON_REQUESTS = [
    "검사 결과를 당일 받아야 합니다.",
    "진료가 끝나면 약국 방문도 함께 부탁드립니다.",
    "친절하게 설명해 주시면 감사하겠습니다.",
];

export const PARTNER_REQUESTS: PartnerRequest[] = [
    {
        id: "req-1",
        plan: "Basic",
        hospital: "강동경희대학교병원",
        type: "접수 동행",
        listTime: "오늘 11:00",
        duration: "예상 소요시간 2시간",
        hospitalTime: "11:00",
        hospitalDate: "2025.05.28 (수)",
        arriveTime: "10:45",
        arriveDate: "2025.05.28 (수)",
        estDuration: "약 2시간",
        amount: 20000,
        responseBy: "09:36 이내 응답 부탁드립니다.",
        code: "A20250528-1100",
        serviceType: "BASIC 서비스",
        departure: "병원 현장 만남",
        schedule: [
            {
                no: "01",
                kind: "hospital",
                label: "강동경희대학교병원 접수 지원",
                time: "11:00",
            },
            { no: "02", kind: "hospital", label: "진료 동행", time: "11:30" },
            {
                no: "03",
                kind: "pharmacy",
                label: "약국 동행 (약 수령 도움)",
                time: "약 30분 소요",
            },
        ],
        customer: {
            name: "박정호",
            age: "68세",
            gender: "남성",
            treatment: "내과 진료",
            purpose: "정기 검진 및 처방",
            cautions: COMMON_CAUTIONS,
            requests: COMMON_REQUESTS,
        },
    },
    {
        id: "req-2",
        plan: "Plus",
        hospital: "삼성서울병원",
        type: "진료 동행",
        listTime: "오늘 13:00",
        duration: "예상 소요시간 2시간",
        hospitalTime: "13:00",
        hospitalDate: "2025.05.28 (수)",
        arriveTime: "12:00",
        arriveDate: "2025.05.28 (수)",
        estDuration: "약 2시간",
        amount: 30000,
        responseBy: "09:36 이내 응답 부탁드립니다.",
        code: "A20250528-1300",
        serviceType: "PLUS 서비스",
        departure: "강남구 역삼동 (자택)",
        schedule: [
            { no: "01", kind: "home", label: "자택 픽업", time: "12:00" },
            {
                no: "02",
                kind: "hospital",
                label: "삼성서울병원 (검사/진료 동행)",
                time: "13:00",
            },
            {
                no: "03",
                kind: "pharmacy",
                label: "인근 약국 (약 수령 도움)",
                time: "약 40분 소요",
            },
            {
                no: "04",
                kind: "home",
                label: "자택 귀가",
                time: "종료 예정 15:00",
            },
        ],
        customer: {
            name: "김영희",
            age: "72세",
            gender: "여성",
            treatment: "혈액검사 및 내과 진료",
            purpose: "건강검진 결과 상담 및 만성질환관리",
            cautions: COMMON_CAUTIONS,
            requests: COMMON_REQUESTS,
        },
    },
    {
        id: "req-3",
        plan: "Plus",
        hospital: "한양대학교병원",
        type: "약국 동행",
        listTime: "내일 10:00",
        duration: "예상 소요시간 2시간",
        hospitalTime: "10:00",
        hospitalDate: "2025.05.29 (목)",
        arriveTime: "09:00",
        arriveDate: "2025.05.29 (목)",
        estDuration: "약 2시간",
        amount: 30000,
        responseBy: "09:36 이내 응답 부탁드립니다.",
        code: "A20250529-1000",
        serviceType: "PLUS 서비스",
        departure: "성동구 행당동 (자택)",
        schedule: [
            { no: "01", kind: "home", label: "자택 픽업", time: "09:00" },
            {
                no: "02",
                kind: "hospital",
                label: "한양대학교병원 (진료 동행)",
                time: "10:00",
            },
            {
                no: "03",
                kind: "pharmacy",
                label: "인근 약국 (약 수령 도움)",
                time: "약 40분 소요",
            },
            {
                no: "04",
                kind: "home",
                label: "자택 귀가",
                time: "종료 예정 12:00",
            },
        ],
        customer: {
            name: "이순자",
            age: "75세",
            gender: "여성",
            treatment: "정형외과 진료 및 물리치료",
            purpose: "관절 통증 진료 및 약 처방",
            cautions: COMMON_CAUTIONS,
            requests: COMMON_REQUESTS,
        },
    },
];

export function getPartnerRequest(id: string): PartnerRequest | undefined {
    return PARTNER_REQUESTS.find((r) => r.id === id);
}
