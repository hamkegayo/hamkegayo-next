/** 파트너 목업 데이터 (STEP5·6·7 공용) */

export type Partner = {
    id: string;
    name: string;
    license: string; // 간호사 / 간호조무사
    recommendType: string; // 적합도 추천 / 거리 추천
    status: "accepted" | "waiting"; // 수락완료 / 수락대기
    rating: number;
    reviewCount: number;
    career: string; // "3년 경력"
    region: string; // "서울 종로구"
    distance: string; // "5.1km"
    specialties: string; // "거동보조, 병원동행 전문"
    intro: string;
    experience: string;
    recommendReasons: string[];
    badges: string[];
    metrics: { label: string; value: string }[];
    reportStructure: string[];
};

export const PARTNERS: Partner[] = [
    {
        id: "p1",
        name: "박소연",
        license: "간호사",
        recommendType: "적합도 추천",
        status: "accepted",
        rating: 4.9,
        reviewCount: 125,
        career: "3년 경력",
        region: "서울 종로구",
        distance: "5.1km",
        specialties: "거동보조, 병원동행 전문",
        intro: "수면내시경 동행 경험이 확인된 간호사이며 서울아산병원 경험이 확인됐고 2.1km 반경에서 수락 가능성을 확인했고 시간준수율 98%를 유지하고 있습니다. 기본 안전 배지도 함께 확인됩니다.",
        experience:
            "서울특별시 종로구 활동 파트너 · 수면내시경 동행 28건, 항암주사실 동행 19건 경험.",
        recommendReasons: ["수면내시경", "서울아산병원", "시간준수율 98%"],
        badges: [
            "CPR 인증",
            "서울아산병원 경험",
            "AED 교육 이수",
            "응급상황 대응",
        ],
        metrics: [
            { label: "취소율", value: "1%" },
            { label: "시간준수율", value: "98%" },
            { label: "재이용률", value: "62%" },
            { label: "완료율", value: "97%" },
        ],
        reportStructure: [
            "병원 도착 및 접수 완료 시간",
            "진료, 검사, 수납, 약국 이동 단계 요약",
            "보호자 공유 메시지와 귀가 후 확인사항 정리",
        ],
    },
    {
        id: "p2",
        name: "정하늘",
        license: "간호사",
        recommendType: "적합도 추천",
        status: "waiting",
        rating: 4.5,
        reviewCount: 88,
        career: "2년 경력",
        region: "서울 종로구",
        distance: "5.1km",
        specialties: "검진센터, 치과 동행 전문",
        intro: "수면내시경 동행 경험이 확인된 간호사이며 검진센터 및 치과 동행 경험이 확인됐고 5.1km 반경에서 수락 가능성을 확인했고 시간준수율 95%를 유지하고 있습니다. 기본 안전 배지도 함께 확인됩니다.",
        experience:
            "서울특별시 종로구 활동 파트너 · 검진센터 동행 22건, 치과 동행 14건 경험.",
        recommendReasons: ["검진센터", "치과 동행", "시간준수율 95%"],
        badges: ["CPR 인증", "감염관리 교육", "응급상황 대응"],
        metrics: [
            { label: "취소율", value: "2%" },
            { label: "시간준수율", value: "95%" },
            { label: "재이용률", value: "55%" },
            { label: "완료율", value: "96%" },
        ],
        reportStructure: [
            "병원 도착 및 접수 완료 시간",
            "진료, 검사, 수납, 약국 이동 단계 요약",
            "보호자 공유 메시지와 귀가 후 확인사항 정리",
        ],
    },
    {
        id: "p3",
        name: "김은서",
        license: "간호조무사",
        recommendType: "거리 추천",
        status: "accepted",
        rating: 3.8,
        reviewCount: 41,
        career: "1년 경력",
        region: "서울 종로구",
        distance: "5.1km",
        specialties: "거동보조, 병원동행",
        intro: "수면내시경 동행 경험이 확인된 간호조무사이며 5.1km 반경에서 수락 가능성을 확인했고 시간준수율 92%를 유지하고 있습니다. 기본 안전 배지도 함께 확인됩니다.",
        experience: "서울특별시 종로구 활동 파트너 · 병원 동행 17건 경험.",
        recommendReasons: ["거동보조", "근거리", "시간준수율 92%"],
        badges: ["CPR 인증", "응급상황 대응"],
        metrics: [
            { label: "취소율", value: "3%" },
            { label: "시간준수율", value: "92%" },
            { label: "재이용률", value: "48%" },
            { label: "완료율", value: "94%" },
        ],
        reportStructure: [
            "병원 도착 및 접수 완료 시간",
            "진료, 검사, 수납, 약국 이동 단계 요약",
            "보호자 공유 메시지와 귀가 후 확인사항 정리",
        ],
    },
];

export const RECOMMENDED_PARTNER = PARTNERS[0];

export function getPartner(id: string): Partner | undefined {
    return PARTNERS.find((p) => p.id === id);
}
