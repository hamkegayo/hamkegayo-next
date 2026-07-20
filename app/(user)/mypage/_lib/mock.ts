/** 마이페이지 목업 예약 데이터 (실제 연동 전 데모용) */

export type CurrentReservation = {
    statusLabel: string;
    hospital: string;
    datetime: string;
    plan: string;
};

export type RecentReservation = {
    id: string;
    hospital: string;
    datetime: string;
    plan: string;
    statusLabel: string;
    review: "write" | "view";
};

export const CURRENT_RESERVATION: CurrentReservation = {
    statusLabel: "매칭 대기중",
    hospital: "서울대학교 병원",
    datetime: "2026.06.10 (화) 오전 10:00",
    plan: "플러스 서비스 (자택 방문 + 병원 동행 + 귀가 지원)",
};

export type ReservationDetail = {
    shortCode: string;
    reservedAt: string;
    currentStep: number; // 0=파트너 확정
    stepTime: string;
    code: string;
    service: string;
    visitAt: string;
    partnerArriveAt: string;
    hospital: string;
    departAddress: string;
    patient: string;
    phone: string;
    cautions: string;
    requests: string;
    payment: { service: number; extra: number; total: number };
    partner: {
        name: string;
        rating: number;
        reviewCount: number;
        meta: string;
        tags: string;
    };
    included: string[];
    notices: string[];
};

/** 예약 상세 목업 (id 무관, 데모 고정값) */
export function getReservationDetail(_id: string): ReservationDetail {
    return {
        shortCode: "R20260501",
        reservedAt: "2026.05.01",
        currentStep: 0,
        stepTime: "05.01 10:00",
        code: "R20260501-0001",
        service: "플러스 서비스 (자택 방문 + 병원 동행 + 귀가 지원)",
        visitAt: "2026. 05. 01 (화) 오전 10:00",
        partnerArriveAt: "2026. 05. 01 (화) 오전 9:30",
        hospital: "서울대학교 병원",
        departAddress: "서울특별시 강남구 역삼동 123-45",
        patient: "김서현 (여 / 2000.10.25)",
        phone: "010-1234-5678",
        cautions: "몸이 좋지 않으셔서 부축이 필요합니다.",
        requests: "다음 예약을 꼭 잡아주세요.",
        payment: { service: 65000, extra: 0, total: 65000 },
        partner: {
            name: "박소연 파트너",
            rating: 4.9,
            reviewCount: 20,
            meta: "간호사 경력 8년 · 동행경험 50회",
            tags: "친절해요 · 시간 약속을 잘 지켜요",
        },
        included: [
            "자택 방문 및 픽업",
            "병원 이동 지원",
            "접수 및 수납 지원",
            "진료 및 검사 동행",
            "귀가 동행 지원",
            "보호자 리포트 전달",
        ],
        notices: [
            "서비스 전날 파트너가 연락드려 최종 확인합니다.",
            "당일 취소시 취소 수수료가 발생합니다.",
            "궁금한 점은 고객센터로 문의주세요.",
        ],
    };
}

export const RECENT_RESERVATIONS: RecentReservation[] = [
    {
        id: "r1",
        hospital: "서울대학교 병원",
        datetime: "2026.06.10 (화) 오전 10:00",
        plan: "베이직 서비스 (병원 내 동행)",
        statusLabel: "서비스 완료",
        review: "write",
    },
    {
        id: "r2",
        hospital: "삼성서울병원",
        datetime: "2026.05.03 (화) 오전 10:00",
        plan: "플러스 서비스 (자택 방문 + 병원 동행 + 귀가 지원)",
        statusLabel: "서비스 완료",
        review: "view",
    },
];
