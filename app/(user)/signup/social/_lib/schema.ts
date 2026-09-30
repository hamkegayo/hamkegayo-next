import { z } from "zod";

import { isValidPhone, normalizePhone } from "@/lib/otp";

export const socialSignupSchema = z
    .object({
        name: z.string().trim().min(1, "이름을 입력해 주세요.").max(50),
        phone: z
            .string()
            .min(1, "휴대폰번호를 입력해 주세요.")
            .refine(
                (value) => isValidPhone(normalizePhone(value)),
                "올바른 휴대폰번호를 입력해 주세요.",
            ),
        agreeService: z.boolean(),
        agreePrivacy: z.boolean(),
        agreePersonal: z.boolean(),
        agreeSensitive: z.boolean(),
    })
    .superRefine((value, context) => {
        if (
            !value.agreeService ||
            !value.agreePrivacy ||
            !value.agreePersonal ||
            !value.agreeSensitive
        ) {
            context.addIssue({
                code: "custom",
                path: ["agreements"],
                message: "동의가 필요한 항목이 있어요. 모두 체크해 주세요.",
            });
        }
    });

export type SocialSignupValues = z.infer<typeof socialSignupSchema>;
