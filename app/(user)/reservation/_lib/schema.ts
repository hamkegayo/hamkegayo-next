import { z } from "zod";

const required = "필수 입력 항목입니다.";

/** STEP1 · 이용자 / 진료 정보 */
export const step1Schema = z.object({
    userName: z.string().min(1, required),
    userBirth: z.string().min(1, required),
    userGender: z.string().min(1, "성별을 선택해 주세요."),
    userPhone: z.string().min(1, required),
    guardianName: z.string().min(1, required),
    guardianPhone: z.string().min(1, required),
    relation: z.string().min(1, "관계를 선택해 주세요."),
    treatment: z.string().min(1, required),
    purpose: z.string().min(1, required),
    // 거동·인지 상태는 매칭 전 파트너에게 제공되는 민감정보다 (처리방침 제5조 ④).
    // 파트너가 수행 가능 여부를 판단하는 근거라 필수로 받는다.
    mobilityStatus: z.string().min(1, "거동 상태를 선택해 주세요."),
    cognitiveStatus: z.string().min(1, "인지 상태를 선택해 주세요."),
    cautions: z.string().optional(),
    docPrescription: z.boolean().optional(),
    docReceipt: z.boolean().optional(),
    docCertificate: z.boolean().optional(),
    otherRequests: z.string().optional(),
});

/** STEP2 · 병원 및 일정 정보 */
export const step2Schema = z.object({
    useDate: z.string().min(1, required),
    arriveTime: z.string().min(1, "시간을 선택해 주세요."),
    reserveTime: z.string().min(1, "시간을 선택해 주세요."),
    duration: z.string().min(1, "시간을 선택해 주세요."),
    departAddress: z.string().min(1, required),
    // 병원명은 매칭 전 파트너에게 제공되는 단계 1 항목이다 (처리방침 제5조 ②).
    // 주소는 확정 후에만 제공되므로 이름을 따로 받는다.
    hospitalName: z.string().min(1, required),
    hospitalAddress: z.string().min(1, required),
});

/**
 * STEP4 는 "신청 내역 확인" 화면이라 입력 필드가 없다 (동의 체크만 로컬 상태).
 *
 *  결제 정보 스키마가 여기 있었으나 #54 에서 제거했다 —
 *  카드 정보는 PG 결제창이 직접 받고 우리는 저장하지 않는다.
 *  카드번호·유효기간을 우리 폼에서 받으면 PCI-DSS 대상이 된다.
 */

export type Step1Values = z.infer<typeof step1Schema>;
export type Step2Values = z.infer<typeof step2Schema>;

/** 서버 예약 등록 입력 (STEP1 + STEP2 + 플랜, 성별/플랜은 enum으로 강화) */
export const reservationServerSchema = step1Schema.merge(step2Schema).extend({
    userGender: z.enum(["female", "male"]),
    plan: z.enum(["basic", "plus"]),
});

export type ReservationInput = z.infer<typeof reservationServerSchema>;
