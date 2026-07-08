import { z } from "zod";

// 특수문자 1자 이상 포함 여부
const SPECIAL_CHAR = /[!@#$%^&*(),.?":{}|<>[\]~`_\-+=;'/\\]/;

const passwordField = z
  .string()
  .min(1, "비밀번호를 입력해 주세요.")
  .refine(
    (v) => v.length >= 8 && SPECIAL_CHAR.test(v),
    "올바른 비밀번호가 아닙니다.",
  );

/** 일반 로그인 — 이메일 + 비밀번호 */
export const userLoginSchema = z.object({
  email: z
    .string()
    .min(1, "이메일을 입력해 주세요.")
    .refine((v) => z.email().safeParse(v).success, "올바른 이메일 형식이 아닙니다."),
  password: passwordField,
});

/** 파트너 로그인 — 발급 아이디 + 비밀번호 */
export const partnerLoginSchema = z.object({
  loginId: z.string().min(1, "아이디를 입력해 주세요."),
  password: passwordField,
});

/** 로그인 유형 — 일반 사용자 / 파트너 (식별자가 다름: 이메일 / 아이디) */
export type LoginType = "user" | "partner";

/** 폼에서 다루는 전체 값(두 유형의 상위집합) */
export type LoginFormValues = {
  email: string;
  loginId: string;
  password: string;
};

export const loginDefaultValues: LoginFormValues = {
  email: "",
  loginId: "",
  password: "",
};
