export type WorkHistory = {
    id: string;
    hospital: string;
    period: string;
    department: string;
    duties: string;
};

export type PartnerDetail = {
    partnerId: string;
    name: string;
    publicConsent: boolean;
    intro: string | null;
    avatarUrl: string | null;
    workHistory: WorkHistory[];
    qualifications: { type: string; issuer: string | null }[];
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
    histories: (WorkHistory & { status: "PENDING" | "VERIFIED" })[];
};
