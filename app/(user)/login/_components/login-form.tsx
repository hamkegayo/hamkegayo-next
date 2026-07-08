"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema, type LoginType, type LoginValues } from "../_lib/schema";

const TABS: { type: LoginType; label: string }[] = [
  { type: "user", label: "일반 로그인" },
  { type: "partner", label: "파트너 로그인" },
];

const READY_MESSAGE = "준비 중인 기능입니다.";

export function LoginForm() {
  const [type, setType] = useState<LoginType>("user");
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    clearErrors,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    mode: "onSubmit",
    reValidateMode: "onSubmit",
    defaultValues: { email: "", password: "" },
  });

  const changeTab = (next: LoginType) => {
    if (next === type) return;
    setType(next);
    setShowPassword(false);
    reset();
  };

  const onSubmit = (values: LoginValues) => {
    // TODO(be): 로그인 유형(type)에 따라 분리된 인증 테이블로 요청 처리
    console.log("[login] submit", { type, ...values });
  };

  const notReady = () => toast.info(READY_MESSAGE);

  const title = type === "user" ? "일반 로그인" : "파트너 로그인";

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
      <div className="mt-14 text-center">
        <h1 className="text-3xl font-extrabold text-foreground">{title}</h1>
        <p className="mt-3 text-muted-foreground">
          서비스 이용을 위해 로그인을 해주세요.
        </p>
      </div>

      {/* 폼 */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="mx-auto mt-10 max-w-md"
      >
        {/* 이메일 */}
        <div className="space-y-2">
          <Label htmlFor="email">이메일</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
            aria-invalid={!!errors.email}
            {...register("email", {
              // 에러가 뜬 뒤 다시 입력하면 원래(도움말) 상태로 되돌림
              onChange: () => errors.email && clearErrors("email"),
            })}
          />
          <p
            className={cn(
              "text-sm",
              errors.email ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {errors.email?.message ?? "가입 시 사용한 이메일을 입력해 주세요."}
          </p>
        </div>

        {/* 비밀번호 */}
        <div className="mt-5 space-y-2">
          <Label htmlFor="password">비밀번호</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="비밀번호를 입력해 주세요"
              aria-invalid={!!errors.password}
              className="pr-11"
              {...register("password", {
                onChange: () => errors.password && clearErrors("password"),
              })}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
              className="absolute inset-y-0 right-0 flex items-center px-3.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPassword ? (
                <EyeOff className="size-5" />
              ) : (
                <Eye className="size-5" />
              )}
            </button>
          </div>
          <p
            className={cn(
              "text-sm",
              errors.password ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {errors.password?.message ?? "대·소문자를 확인해 주세요."}
          </p>
        </div>

        {/* 로그인 버튼 */}
        <button
          type="submit"
          className="mt-8 h-12 w-full rounded-lg bg-brand text-base font-bold text-brand-foreground transition-colors hover:bg-brand/90"
        >
          로그인
        </button>

        {/* 소셜 로그인 (준비 중) */}
        <button
          type="button"
          onClick={notReady}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-kakao text-base font-bold text-kakao-foreground transition-colors hover:brightness-95"
        >
          <Image
            src="/common/kakao-logo.svg"
            alt=""
            width={20}
            height={20}
            aria-hidden
          />
          카카오톡 로그인
        </button>
        <button
          type="button"
          onClick={notReady}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-naver text-base font-bold text-naver-foreground transition-colors hover:brightness-95"
        >
          <span className="text-lg font-black leading-none">N</span>
          네이버 로그인
        </button>

        {/* 하단 링크 */}
        <div className="mt-6 flex items-center justify-center gap-4 text-sm font-semibold text-foreground">
          {/* 회원가입: 추후 개발 예정 */}
          <a href="#" className="transition-colors hover:text-brand">
            회원가입
          </a>
          <button
            type="button"
            onClick={notReady}
            className="transition-colors hover:text-brand"
          >
            비밀번호 찾기
          </button>
        </div>
      </form>
    </div>
  );
}
