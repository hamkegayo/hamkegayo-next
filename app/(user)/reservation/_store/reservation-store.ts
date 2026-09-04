import { create } from "zustand";

/**
 * 예약 플로우 전체 단계 수 (진행 점 인디케이터 기준).
 *
 *  1 이용자정보 → 2 병원정보 → 3 서비스선택 → 4 신청내역확인
 *  → 5 매칭 → 6 파트너선택 → 7 결제 → 8 완료
 *
 *  결제가 파트너 선택 **뒤**에 온다 — 약관 제9조 ④ (선택 + 선결제 완료 시점에 확정).
 *  매칭 실패 시 환불이 발생하지 않는 것도 이 순서 덕분이다.
 */
export const TOTAL_STEPS = 8;

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
    mobilityStatus: string;
    cognitiveStatus: string;
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
    hospitalName: string;
    hospitalAddress: string;
    // STEP3 · 서비스 선택
    plan: Plan;
    // STEP6 · 파트너 선택
    partnerId: string;
    /** 선택한 파트너 이름 (STEP7·8 표시용) */
    confirmedPartnerName: string;
    // STEP4 등록 결과 (서버 반환)
    reservationCode: string;
    reservationId: string;
    /**
     * STEP7 · 선결제 기한 (ISO). 파트너 선택 시점 +30분, 결제창 진입 시 +10분 연장된다.
     * 실제 강제는 DB(reservations.payment_deadline)가 한다 — 이 값은 카운트다운 표시용이다.
     */
    paymentDeadline: string;
    /**
     * STEP7 · 선결제 금액(할인 전). 예약 등록 시 서버가 확정한 값을 그대로 표시한다.
     * 실제 청구액은 승인 라우트가 예약에서 다시 계산해 대조하므로 이 값은 표시용이다.
     */
    prepaidAmount: number;
    /** STEP7 · 사용 가능한 포인트 잔액 */
    pointBalance: number;
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
    mobilityStatus: "",
    cognitiveStatus: "",
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
    hospitalName: "",
    hospitalAddress: "",
    plan: "",
    partnerId: "",
    confirmedPartnerName: "",
    reservationCode: "",
    reservationId: "",
    paymentDeadline: "",
    prepaidAmount: 0,
    pointBalance: 0,
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
    /**
     * 결제창에서 돌아온 뒤 상태를 복원한다.
     *
     * 결제는 PG 페이지로 **전체 이동**하므로 모듈 싱글턴인 이 스토어가 통째로 날아간다.
     * 승인 라우트가 `?pay=&rid=` 로 돌려보내면 서버에서 예약을 다시 읽어 여기로 넣는다.
     */
    hydrate: (step: number, partial: Partial<ReservationData>) => void;
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
    hydrate: (step, partial) =>
        set((s) => ({
            step: Math.min(Math.max(step, 1), TOTAL_STEPS),
            // 결제창을 거쳐 왔으므로 안내 모달은 이미 본 것으로 본다.
            introConfirmed: true,
            finished: false,
            data: { ...s.data, ...partial },
        })),
}));

/**
 * 플랜 표시용 라벨 / 가격은 공용 단일 소스로 이동(#20).
 *  기존 import 경로 호환을 위해 여기서 재-export 한다.
 */
export { PLAN_INFO } from "@/lib/reservation";
