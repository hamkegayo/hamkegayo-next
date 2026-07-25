/** 사용자 이용 후기 목업 데이터 */

export type ReviewPlan = "Basic" | "Plus";

export type Review = {
    id: number;
    plan: ReviewPlan;
    title: string;
    author: string;
    rating: number;
    date: string;
    content: string;
    /** 운영팀 답변 (있는 경우) */
    reply?: string;
};

/** 목록 상단 "전체 N건" 표기 (페이지네이션은 UI 전용) */
export const TOTAL_REVIEWS = 100;

export const REVIEWS: Review[] = [
    {
        id: 100,
        plan: "Plus",
        title: "눈 수술 후 동행 받았습니다",
        author: "류O태",
        rating: 5,
        date: "2026-04-28",
        content:
            "백내장 수술 후라 앞이 잘 안 보이셨는데, 접수부터 귀가까지 한 분이 끝까지 함께해 주셔서 정말 든든했습니다. 수술 주의사항도 따로 정리해 알려주셔서 큰 도움이 됐어요.",
        reply: "소중한 후기 감사합니다. 앞으로도 안심하고 맡기실 수 있도록 최선을 다하겠습니다.",
    },
    {
        id: 99,
        plan: "Plus",
        title: "가격 대비 만족도가 높아요",
        author: "황O경",
        rating: 4,
        date: "2026-04-26",
        content:
            "처음엔 비용이 부담될까 걱정했는데, 받은 서비스에 비하면 오히려 합리적이라는 생각이 들었어요. 리포트도 꼼꼼해서 다음 진료 준비가 수월했습니다.",
    },
    {
        id: 98,
        plan: "Basic",
        title: "택시 호출까지 해주셔서 편했어요",
        author: "정O아",
        rating: 4,
        date: "2026-04-23",
        content:
            "거동이 불편하신 어머니를 위해 택시 호출과 승하차까지 도와주셔서 이동이 훨씬 수월했습니다. 세심하게 챙겨주셔서 감사했어요.",
    },
    {
        id: 97,
        plan: "Basic",
        title: "안심 귀가 서비스 추천합니다",
        author: "차O욱",
        rating: 5,
        date: "2026-04-22",
        content:
            "병원까지만 모셔다드리는 게 아니라 집까지 안전하게 귀가시켜 주시는 게 가장 마음에 들었어요. 도착해서 보호자에게 알림까지 보내주시니 일하는 중에도 안심이 됐습니다. 어머니도 혼자 오시는 것보다 훨씬 편하다고 하셨어요.",
        reply: "따뜻한 후기 감사합니다. 말씀해주신 부분 파트너님께도 꼭 전달드리겠습니다. 다음 이용 때도 변함없는 서비스로 보답하겠습니다.",
    },
    {
        id: 96,
        plan: "Basic",
        title: "처음 이용해봤는데 만족합니다",
        author: "고O란",
        rating: 4,
        date: "2026-04-20",
        content:
            "처음이라 반신반의했는데, 예약 과정부터 진료 동행까지 흐름이 매끄러웠어요. 다음에도 믿고 이용할 것 같습니다.",
    },
    {
        id: 95,
        plan: "Plus",
        title: "안심 귀가 서비스 추천합니다",
        author: "김O현",
        rating: 5,
        date: "2026-04-18",
        content:
            "검사 결과 상담까지 함께 들어가 의사 선생님 설명을 정리해 주셔서, 멀리 있는 저도 상황을 정확히 알 수 있었습니다. 정말 감사했어요.",
    },
    {
        id: 94,
        plan: "Plus",
        title: "검사 많은 날도 든든했어요",
        author: "이O수",
        rating: 5,
        date: "2026-04-16",
        content:
            "검사 항목이 많아 하루 종일 병원을 돌아야 했는데, 대기와 이동을 잘 챙겨주셔서 어머니가 지치지 않으셨어요. 중간중간 상태도 공유해 주셨습니다.",
    },
    {
        id: 93,
        plan: "Basic",
        title: "비 오는 날도 안전하게",
        author: "문O자",
        rating: 3,
        date: "2026-04-13",
        content:
            "비가 많이 오는 날이었는데 우산까지 챙겨 부축해 주셔서 넘어질 걱정 없이 다녀왔습니다. 조금 더 여유 있게 도착했다면 완벽했을 것 같아요.",
    },
    {
        id: 92,
        plan: "Basic",
        title: "처음 이용해봤는데 만족합니다",
        author: "오O정",
        rating: 4,
        date: "2026-04-12",
        content:
            "부모님만 보내드리기 걱정됐는데, 파트너님이 친절하게 응대해 주셔서 안심했습니다. 접수와 수납을 도와주셔서 편했어요.",
    },
    {
        id: 91,
        plan: "Plus",
        title: "진료실까지 함께 들어가주셔서",
        author: "윤O철",
        rating: 4,
        date: "2026-04-11",
        content:
            "혼자 진료실에 들어가시면 설명을 잘 기억 못 하시는데, 함께 들어가 메모해 주신 덕분에 처방과 다음 일정까지 명확히 알 수 있었습니다.",
    },
];

export function getReview(id: number): Review | undefined {
    return REVIEWS.find((r) => r.id === id);
}

/** 상세 이전/다음 후기 (배열 순서 기준) */
export function getAdjacent(id: number): { prev?: Review; next?: Review } {
    const idx = REVIEWS.findIndex((r) => r.id === id);
    if (idx === -1) return {};
    return { prev: REVIEWS[idx - 1], next: REVIEWS[idx + 1] };
}

/** 후기 작성용 — 이용한 서비스 목록(목업) */
export type UsedService = {
    id: string;
    hospital: string;
    plan: ReviewPlan;
    date: string;
    partner: string;
};

export const USED_SERVICES: UsedService[] = [
    {
        id: "us-1",
        hospital: "서울대학교병원",
        plan: "Basic",
        date: "2025.05.01 (목) 오전 10:00",
        partner: "박소연 파트너",
    },
    {
        id: "us-2",
        hospital: "삼성서울병원",
        plan: "Plus",
        date: "2025.05.01 (목) 오전 10:00",
        partner: "박소연 파트너",
    },
    {
        id: "us-3",
        hospital: "서울아산병원",
        plan: "Basic",
        date: "2025.05.01 (목) 오전 10:00",
        partner: "박소연 파트너",
    },
    {
        id: "us-4",
        hospital: "서울아산병원",
        plan: "Basic",
        date: "2025.05.01 (목) 오전 10:00",
        partner: "박소연 파트너",
    },
    {
        id: "us-5",
        hospital: "서울아산병원",
        plan: "Basic",
        date: "2025.05.01 (목) 오전 10:00",
        partner: "박소연 파트너",
    },
];

export function getUsedService(id: string): UsedService | undefined {
    return USED_SERVICES.find((s) => s.id === id);
}
