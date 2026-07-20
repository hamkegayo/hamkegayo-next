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

/** STEP4 · 결제 정보 (결제수단이 카드일 때만 카드 필드 검증) */
export const step4Schema = z
    .object({
        method: z.string().min(1, "결제수단을 선택해 주세요."),
        cardCompany: z.string().optional(),
        cardNumber: z.string().optional(),
        expMonth: z.string().optional(),
        expYear: z.string().optional(),
        installment: z.string().optional(),
    })
    .superRefine((v, ctx) => {
        if (v.method !== "card") return;
        if (!v.cardCompany) {
            ctx.addIssue({
                code: "custom",
                path: ["cardCompany"],
                message: "카드사를 선택해 주세요.",
            });
        }
        const digits = (v.cardNumber ?? "").replace(/\D/g, "");
        if (digits.length < 15) {
            ctx.addIssue({
                code: "custom",
                path: ["cardNumber"],
                message: "카드 번호를 확인해 주세요.",
            });
        }
        if (!/^(0[1-9]|1[0-2])$/.test(v.expMonth ?? "")) {
            ctx.addIssue({
                code: "custom",
                path: ["expMonth"],
                message: "월(MM)을 확인해 주세요.",
            });
        }
        if (!/^\d{2}$/.test(v.expYear ?? "")) {
            ctx.addIssue({
                code: "custom",
                path: ["expYear"],
                message: "년(YY)을 확인해 주세요.",
            });
        }
        if (!v.installment) {
            ctx.addIssue({
                code: "custom",
                path: ["installment"],
                message: "할부 기간을 선택해 주세요.",
            });
        }
    });

export type Step1Values = z.infer<typeof step1Schema>;
export type Step2Values = z.infer<typeof step2Schema>;
export type Step4Values = z.infer<typeof step4Schema>;
