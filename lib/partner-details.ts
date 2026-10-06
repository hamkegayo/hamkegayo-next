export type WorkHistory = {
    id: string;
    hospital: string;
    period: string;
    department: string;
    duties: string;
    kind?: "MEDICAL" | "COMPANION";
};

/**
 * 공개 고지 v2(활동 정보 추가) 동의 버전 (#226). DB set_partner_public_consent_unreleased 와 같다.
 * v1('2026-10-04') 동의자에게는 활동 정보를 공개하지 않는다 (처리방침 제16조 ③).
 */
export const ACTIVITY_CONSENT_VERSION = "2026-10-06";

/** 고객 상세에 공개하는 활동 정보. v2 동의 + 공개 스위치가 모두 있을 때만 온다 */
export type PartnerActivityPublic = {
    /** 지역 전체 이름 (예: "강원특별자치도 원주시") */
    regions: string[];
    times: {
        weekday: [string, string] | null;
        saturday: [string, string] | null;
        holiday: [string, string] | null;
    };
    transports: string[];
    mobility: string[];
    hospitals: string[];
};

export type PartnerDetail = {
    partnerId: string;
    name: string;
    publicConsent: boolean;
    intro: string | null;
    avatarUrl: string | null;
    workHistory: WorkHistory[];
    qualifications: { type: string; issuer: string | null }[];
    activity: PartnerActivityPublic | null;
    rating: number | null;
    reviewCount: number;
    reviews: {
        id: string;
        rating: number;
        title: string;
        content: string;
        author: string;
        createdAt: string;
    }[];
};

export type PartnerPublicProfile = {
    consent: boolean;
    /** 동의한 고지 버전. 동의 안 했으면 null */
    consentVersion: string | null;
    publicEnabled: boolean;
    /** 활동 정보 고객 공개가 열렸는지 (partner_activity_release) */
    activityPublicEnabled: boolean;
    histories: (WorkHistory & { status: "PENDING" | "VERIFIED" })[];
};
