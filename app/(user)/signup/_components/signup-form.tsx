"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  partnerSignupSchema,
  signupDefaultValues,
  userSignupSchema,
  type SignupFormValues,
  type SignupType,
} from "../_lib/schema";
import { signUpUser, activatePartner } from "../_lib/actions";
import { PhoneVerificationField } from "./phone-verification-field";

const TABS: { type: SignupType; label: string }[] = [
  { type: "user", label: "일반 회원가입" },
  { type: "partner", label: "파트너 회원가입" },
];

const AGREEMENTS = [
  { name: "agreeService", label: "서비스 약관에 동의" },
  { name: "agreePrivacy", label: "개인정보 처리방침에 동의" },
  { name: "agreePersonal", label: "일반 개인정보 수집/이용에 동의" },
  { name: "agreeSensitive", label: "민감 개인정보 수집/이용에 동의" },
] as const;

export function SignupForm() {
  const router = useRouter();
  const [type, setType] = useState<SignupType>("user");
  const typeRef = useRef<SignupType>("user");
  const [showPw, setShowPw] = useState(false);
  const [showPwc, setShowPwc] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);

  // 활성 탭에 따라 스키마를 선택하는 커스텀 resolver
  const resolver: Resolver<SignupFormValues> = (values, context, options) => {
    const schema =
      typeRef.current === "user" ? userSignupSchema : partnerSignupSchema;
    return (zodResolver(schema) as unknown as Resolver<SignupFormValues>)(
      values,
      context,
      options,
    );
  };

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<SignupFormValues>({
    resolver,
    mode: "onSubmit",
    reValidateMode: "onSubmit",
    defaultValues: signupDefaultValues,
  });

  const values = useWatch({ control });
  // 'agreements' 는 등록 필드가 아니므로 별도 접근
  const agreementsError = (errors as Record<string, { message?: string }>)
    .agreements?.message;

  const changeTab = (next: SignupType) => {
    if (next === type) return;
    typeRef.current = next;
    setType(next);
    setShowPw(false);
    setShowPwc(false);
    reset(signupDefaultValues);
  };

  const notReady = () => toast.info("준비 중인 기능입니다.");

  const onSubmit = async (v: SignupFormValues) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res =
        typeRef.current === "user"
          ? await signUpUser({
              email: v.email,
              password: v.password,
              name: v.name,
              phone: v.phone,
            })
          : await activatePartner({
              loginId: v.loginId,
              password: v.password,
              name: v.name,
              phone: v.phone,
            });

      if (!res.ok) {
        if (res.field === "email") setError("email", { message: res.message });
        else if (res.field === "loginId")
          setError("loginId", { message: res.message });
        else if (res.field === "phone")
          setError("phone", { message: res.message });
        else toast.error(res.message);
        return;
      }
      setSuccessOpen(true);
    } finally {
      setSubmitting(false);
    }
  };

  const title = type === "user" ? "일반 회원가입" : "파트너 회원가입";
  const description =
    type === "user"
      ? "사용자용 회원가입 페이지 입니다. 파트너로 회원가입을 원하실 경우, 파트너 회원가입을 눌러주세요."
      : "파트너 회원가입 페이지입니다. 일반 회원가입을 원하실 경우, 일반 회원가입을 눌러주세요.";

  return (
    <div className="w-full">
      {/* 탭 */}
      <div className="flex gap-2">
        {TABS.map((tab) => {
          const active = tab.type === type;
          return (
            <button
              key={tab.type}
              type="button"
              onClick={() => changeTab(tab.type)}
              aria-pressed={active}
              className={cn(
                "rounded-full px-5 py-2.5 text-sm font-bold transition-colors",
                active
                  ? "bg-brand text-brand-foreground"
                  : "border border-border bg-background text-foreground hover:bg-muted",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 제목 */}
      <div className="mx-auto mt-14 max-w-md text-center">
        <h1 className="text-3xl font-extrabold text-foreground">{title}</h1>
        <p className="mt-3 text-muted-foreground">{description}</p>
      </div>

      {/* 폼 */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="mx-auto mt-10 max-w-md space-y-5"
      >
        {/* 이메일 / 아이디 */}
        {type === "user" ? (
          <div className="space-y-2">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
              aria-invalid={!!errors.email}
              {...register("email", {
                onChange: () => errors.email && clearErrors("email"),
              })}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="loginId">아이디</Label>
            <Input
              id="loginId"
              autoComplete="username"
              placeholder="제공 받은 아이디를 입력해주세요"
              aria-invalid={!!errors.loginId}
              {...register("loginId", {
                onChange: () => errors.loginId && clearErrors("loginId"),
              })}
            />
            {errors.loginId && (
              <p className="text-sm text-destructive">
                {errors.loginId.message}
              </p>
            )}
          </div>
        )}

        {/* 휴대폰 인증 */}
        <PhoneVerificationField
          key={type}
          phoneField={register("phone", {
            onChange: () => errors.phone && clearErrors("phone"),
          })}
          phoneValue={values.phone ?? ""}
          verified={values.phoneVerified ?? false}
          onVerified={(val) => {
            setValue("phoneVerified", val);
            if (val) clearErrors("phoneVerified");
          }}
          phoneError={errors.phone?.message}
          verifyError={
            (errors as Record<string, { message?: string }>).phoneVerified
              ?.message
          }
        />

        {/* 비밀번호 */}
        <div className="space-y-2">
          <Label htmlFor="password">비밀번호</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              placeholder="비밀번호를 입력해 주세요"
              aria-invalid={!!errors.password}
              className="pr-11"
              {...register("password", {
                onChange: () => errors.password && clearErrors("password"),
              })}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 표시"}
              className="absolute inset-y-0 right-0 flex items-center px-3.5 text-muted-foreground hover:text-foreground"
            >
              {showPw ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </div>

        {/* 비밀번호 확인 */}
        <div className="space-y-2">
          <Label htmlFor="passwordConfirm">비밀번호 확인</Label>
          <div className="relative">
            <Input
              id="passwordConfirm"
              type={showPwc ? "text" : "password"}
              autoComplete="new-password"
              placeholder="비밀번호를 다시 입력해 주세요"
              aria-invalid={!!errors.passwordConfirm}
              className="pr-11"
              {...register("passwordConfirm", {
                onChange: () =>
                  errors.passwordConfirm && clearErrors("passwordConfirm"),
              })}
            />
            <button
              type="button"
              onClick={() => setShowPwc((v) => !v)}
              aria-label={showPwc ? "비밀번호 숨기기" : "비밀번호 표시"}
              className="absolute inset-y-0 right-0 flex items-center px-3.5 text-muted-foreground hover:text-foreground"
            >
              {showPwc ? (
                <EyeOff className="size-5" />
              ) : (
                <Eye className="size-5" />
              )}
            </button>
          </div>
          {errors.passwordConfirm && (
            <p className="text-sm text-destructive">
              {errors.passwordConfirm.message}
            </p>
          )}
        </div>

        {/* 이름 */}
        <div className="space-y-2">
          <Label htmlFor="name">이름</Label>
          <Input
            id="name"
            autoComplete="name"
            placeholder="이름을 입력해 주세요"
            aria-invalid={!!errors.name}
            {...register("name", {
              onChange: () => errors.name && clearErrors("name"),
            })}
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
        </div>

        {/* 약관 동의 */}
        <div className="space-y-3 pt-1">
          {AGREEMENTS.map((item) => (
            <div key={item.name} className="flex items-center gap-2">
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={values[item.name] ?? false}
                  onCheckedChange={(checked) => {
                    setValue(item.name, checked === true);
                    if (agreementsError) clearErrors("agreements" as never);
                  }}
                />
                <span className="text-sm text-foreground">{item.label}</span>
              </label>
              <button
                type="button"
                onClick={notReady}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                [보기]
              </button>
            </div>
          ))}
          {agreementsError && (
            <p className="text-sm text-destructive">{agreementsError}</p>
          )}
        </div>

        {/* 회원가입 버튼 */}
        <button
          type="submit"
          disabled={submitting}
          className="h-12 w-full rounded-lg bg-brand text-base font-bold text-brand-foreground transition-colors hover:bg-brand/90 disabled:opacity-60"
        >
          회원가입
        </button>

        {/* 로그인 링크 */}
        <p className="text-center text-sm text-foreground">
          이미 회원이신가요?{" "}
          <Link href="/login" className="font-bold text-brand hover:underline">
            로그인
          </Link>
        </p>
      </form>

      {/* 가입 완료 모달 */}
      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand/10">
            <Check className="size-6 text-brand" strokeWidth={3} />
          </div>
          <DialogTitle className="mt-4">가입 완료</DialogTitle>
          <DialogDescription className="mt-2">
            회원가입이 완료되었습니다! 로그인 화면으로 이동합니다.
          </DialogDescription>
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="mt-5 h-11 w-full rounded-lg bg-brand text-base font-bold text-brand-foreground transition-colors hover:bg-brand/90"
          >
            확인
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
