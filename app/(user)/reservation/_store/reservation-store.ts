import { create } from "zustand";

/** 예약 플로우 전체 단계 수 (진행 점 인디케이터 기준) */
export const TOTAL_STEPS = 6;

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
};

export const useReservationStore = create<ReservationState>((set) => ({
    step: 1,
    introConfirmed: false,
    data: initialData,
    confirmIntro: () => set({ introConfirmed: true }),
    patch: (partial) => set((s) => ({ data: { ...s.data, ...partial } })),
    next: () => set((s) => ({ step: Math.min(s.step + 1, TOTAL_STEPS) })),
    prev: () => set((s) => ({ step: Math.max(s.step - 1, 1) })),
}));
