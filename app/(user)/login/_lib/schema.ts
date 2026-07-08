import { z } from "zod";

// 특수문자 1자 이상 포함 여부
const SPECIAL_CHAR = /[!@#$%^&*(),.?":{}|<>[\]~`_\-+=;'/\\]/;

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "이메일을 입력해 주세요.")
    .refine((v) => z.email().safeParse(v).success, "올바른 이메일 형식이 아닙니다."),
  password: z
    .string()
    .min(1, "비밀번호를 입력해 주세요.")
    .refine(
      (v) => v.length >= 8 && SPECIAL_CHAR.test(v),
      "올바른 비밀번호가 아닙니다.",
    ),
});

export type LoginValues = z.infer<typeof loginSchema>;

/** 로그인 유형 — 일반 사용자 / 파트너 (실제 인증 테이블이 분리됨) */
export type LoginType = "user" | "partner";
