import { create } from "zustand";

/** 예약 플로우 전체 단계 수 (진행 점 인디케이터 기준) */
export const TOTAL_STEPS = 7;

export type Gender = "female" | "male" | "";
export type Plan = "basic" | "plus" | "";

/** 예약 플로우에서 수집하는 전체 데이터 */
export type ReservationData = {
    // STEP1 · 이용자 정보
    userName: string;
    userBirth: string;
    userGender: Gender;
    userPhone: string;
    guardianName: string;
    guardianPhone: string;
    relation: string;
    // STEP1 · 진료 정보
    treatment: string;
    purpose: string;
    cautions: string;
    docPrescription: boolean;
    docReceipt: boolean;
    docCertificate: boolean;
    otherRequests: string;
    // STEP2 · 병원 및 일정 정보
    useDate: string;
    arriveTime: string;
    reserveTime: string;
    duration: string;
    departAddress: string;
    hospitalAddress: string;
    // STEP3 · 서비스 선택
    plan: Plan;
    // STEP6 · 파트너 선택
    partnerId: string;
};

const initialData: ReservationData = {
    userName: "",
    userBirth: "",
    userGender: "",
    userPhone: "",
    guardianName: "",
    guardianPhone: "",
    relation: "",
    treatment: "",
    purpose: "",
    cautions: "",
    docPrescription: false,
    docReceipt: false,
    docCertificate: false,
    otherRequests: "",
    useDate: "",
    arriveTime: "",
    reserveTime: "",
    duration: "",
    departAddress: "",
    hospitalAddress: "",
    plan: "",
    partnerId: "",
};

type ReservationState = {
    /** 현재 단계 (1부터) */
    step: number;
    /** STEP0 안내 모달 확인 여부 */
    introConfirmed: boolean;
    data: ReservationData;
    confirmIntro: () => void;
    patch: (partial: Partial<ReservationData>) => void;
    next: () => void;
    prev: () => void;
    goStep: (step: number) => void;
};

export const useReservationStore = create<ReservationState>((set) => ({
    step: 1,
    introConfirmed: false,
    data: initialData,
    confirmIntro: () => set({ introConfirmed: true }),
    patch: (partial) => set((s) => ({ data: { ...s.data, ...partial } })),
    next: () => set((s) => ({ step: Math.min(s.step + 1, TOTAL_STEPS) })),
    prev: () => set((s) => ({ step: Math.max(s.step - 1, 1) })),
    goStep: (step) => set({ step: Math.min(Math.max(step, 1), TOTAL_STEPS) }),
}));

/** 플랜 표시용 라벨 / 가격 (베이직 20,000 / 플러스 25,000 통일) */
export const PLAN_INFO: Record<
    Exclude<Plan, "">,
    {
        short: string;
        label: string;
        badge: string;
        price: number;
        extra: number;
    }
> = {
    basic: {
        short: "베이직",
        label: "베이직 서비스 (병원에서 만남 + 진료 동행)",
        badge: "[베이직] 병원 동행 서비스",
        price: 20000,
        extra: 10000,
    },
    plus: {
        short: "플러스",
        label: "플러스 서비스 (자택 픽업 + 병원 동행)",
        badge: "[플러스] 병원 동행 서비스",
        price: 25000,
        extra: 12500,
    },
};
