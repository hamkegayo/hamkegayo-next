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
    hospitalAddress: z.string().min(1, required),
});

export type Step1Values = z.infer<typeof step1Schema>;
export type Step2Values = z.infer<typeof step2Schema>;
