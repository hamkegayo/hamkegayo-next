import { z } from "zod";

import { isValidPhone, normalizePhone } from "@/lib/otp";

const SPECIAL_CHAR = /[!@#$%^&*(),.?":{}|<>[\]~`_\-+=;'/\\]/;

/** 회원가입 유형 — 일반 사용자 / 파트너 */
export type SignupType = "user" | "partner";

// 공통 필드
const commonShape = {
  phone: z
    .string()
    .min(1, "휴대폰번호를 입력해 주세요.")
    .refine((v) => isValidPhone(normalizePhone(v)), "올바른 휴대폰번호를 입력해 주세요."),
  phoneVerified: z.boolean(),
  password: z
    .string()
    .min(1, "비밀번호를 입력해 주세요.")
    .refine(
      (v) => v.length >= 8 && SPECIAL_CHAR.test(v),
      "8자 이상, 특수문자를 포함해 주세요.",
    ),
  passwordConfirm: z.string().min(1, "비밀번호를 한 번 더 입력해 주세요."),
  name: z.string().min(1, "이름을 입력해 주세요."),
  agreeService: z.boolean(),
  agreePrivacy: z.boolean(),
  agreePersonal: z.boolean(),
  agreeSensitive: z.boolean(),
};

// 공통 교차 검증 (인증 여부 / 비밀번호 확인 / 약관 전체 동의)
function refineCommon(
  v: {
    phoneVerified: boolean;
    password: string;
    passwordConfirm: string;
    agreeService: boolean;
    agreePrivacy: boolean;
    agreePersonal: boolean;
    agreeSensitive: boolean;
  },
  ctx: z.RefinementCtx,
) {
  if (!v.phoneVerified) {
    ctx.addIssue({
      code: "custom",
      path: ["phoneVerified"],
      message: "휴대폰 인증을 먼저 해주세요.",
    });
  }
  if (v.passwordConfirm && v.password !== v.passwordConfirm) {
    ctx.addIssue({
      code: "custom",
      path: ["passwordConfirm"],
      message: "비밀번호가 일치하지 않습니다.",
    });
  }
  if (
    !(v.agreeService && v.agreePrivacy && v.agreePersonal && v.agreeSensitive)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["agreements"],
      message: "동의가 필요한 항목이 있어요. 모두 체크해 주세요.",
    });
  }
}

export const userSignupSchema = z
  .object({
    email: z
      .string()
      .min(1, "이메일을 입력해 주세요.")
      .refine((v) => z.email().safeParse(v).success, "올바른 이메일 형식이 아닙니다."),
    ...commonShape,
  })
  .superRefine(refineCommon);

export const partnerSignupSchema = z
  .object({
    loginId: z.string().min(1, "아이디를 입력해 주세요."),
    ...commonShape,
  })
  .superRefine(refineCommon);

/** 폼에서 다루는 전체 값(두 유형의 상위집합) */
export type SignupFormValues = {
  email: string;
  loginId: string;
  phone: string;
  phoneVerified: boolean;
  password: string;
  passwordConfirm: string;
  name: string;
  agreeService: boolean;
  agreePrivacy: boolean;
  agreePersonal: boolean;
  agreeSensitive: boolean;
};

export const signupDefaultValues: SignupFormValues = {
  email: "",
  loginId: "",
  phone: "",
  phoneVerified: false,
  password: "",
  passwordConfirm: "",
  name: "",
  agreeService: false,
  agreePrivacy: false,
  agreePersonal: false,
  agreeSensitive: false,
};
