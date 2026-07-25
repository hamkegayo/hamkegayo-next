/** 파트너 홈 목업 데이터 (실제 연동 전 데모용) */

export type Schedule = {
    time: string;
    hospital: string;
    type: string;
    status: string;
    patient: string;
    plan: "Basic" | "Plus";
};

export type ServiceRequest = {
    time: string;
    duration: string;
    hospital: string;
    type: string;
    plan: "Basic" | "Plus";
};

export const TODAY_SCHEDULES: Schedule[] = [
    {
        time: "10:00 ~ 12:00",
        hospital: "강남세브란스병원",
        type: "접수 동행",
        status: "진행 예정",
        patient: "김*자님",
        plan: "Basic",
    },
    {
        time: "14:30 ~ 16:30",
        hospital: "서울아산병원",
        type: "검사 동행",
        status: "진행 예정",
        patient: "이*민님",
        plan: "Plus",
    },
];

export const NEW_REQUESTS: ServiceRequest[] = [
    {
        time: "오늘 11:00",
        duration: "예상 소요시간 2시간",
        hospital: "강동경희대학교병원",
        type: "접수동행",
        plan: "Basic",
    },
    {
        time: "오늘 13:00",
        duration: "예상 소요시간 2시간",
        hospital: "삼성서울병원",
        type: "진료동행",
        plan: "Plus",
    },
    {
        time: "내일 10:00",
        duration: "예상 소요시간 2시간",
        hospital: "한양대학교병원",
        type: "약국 동행",
        plan: "Plus",
    },
];

export const NOTICE = {
    title: "[안내] 5월 파트너 교육 일정 안내",
    date: "2025.05.01",
};
