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
    /** 확정된 파트너 이름 (STEP7 표시용) */
    confirmedPartnerName: string;
    // STEP4 등록 결과 (서버 반환)
    reservationCode: string;
    reservationId: string;
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
    confirmedPartnerName: "",
    reservationCode: "",
    reservationId: "",
};

type ReservationState = {
    /** 현재 단계 (1부터) */
    step: number;
    /** STEP0 안내 모달 확인 여부 */
    introConfirmed: boolean;
    /**
     * 이 플로우가 끝났는지 (매칭 취소 또는 예약 완료).
     * 스토어는 모듈 싱글턴이라 클라이언트 이동만으로는 비워지지 않는다.
     * 끝난 플로우를 표시해 두고 다음 진입 때 ReservationFlow 가 초기화한다.
     */
    finished: boolean;
    data: ReservationData;
    confirmIntro: () => void;
    patch: (partial: Partial<ReservationData>) => void;
    next: () => void;
    prev: () => void;
    goStep: (step: number) => void;
    /** 플로우 종료 표시 — 화면은 그대로 두고 플래그만 세운다 */
    finish: () => void;
    /** 처음 상태로 되돌린다 */
    reset: () => void;
};

export const useReservationStore = create<ReservationState>((set) => ({
    step: 1,
    introConfirmed: false,
    finished: false,
    data: initialData,
    confirmIntro: () => set({ introConfirmed: true }),
    patch: (partial) => set((s) => ({ data: { ...s.data, ...partial } })),
    next: () => set((s) => ({ step: Math.min(s.step + 1, TOTAL_STEPS) })),
    prev: () => set((s) => ({ step: Math.max(s.step - 1, 1) })),
    goStep: (step) => set({ step: Math.min(Math.max(step, 1), TOTAL_STEPS) }),
    finish: () => set({ finished: true }),
    reset: () =>
        set({
            step: 1,
            introConfirmed: false,
            finished: false,
            data: initialData,
        }),
}));

/**
 * 플랜 표시용 라벨 / 가격은 공용 단일 소스로 이동(#20).
 *  기존 import 경로 호환을 위해 여기서 재-export 한다.
 */
export { PLAN_INFO } from "@/lib/reservation";
