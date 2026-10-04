"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPhoneNumber } from "@/lib/format";

import { completeSocialSignup } from "../_lib/actions";
import { socialSignupSchema, type SocialSignupValues } from "../_lib/schema";

const AGREEMENTS = [
    { name: "agreeService", label: "서비스 약관에 동의", href: "/terms" },
    {
        name: "agreePrivacy",
        label: "개인정보 처리방침에 동의",
        href: "/privacy",
    },
    {
        name: "agreePersonal",
        label: "일반 개인정보 수집/이용에 동의",
        href: "/privacy#article-2",
    },
    {
        name: "agreeSensitive",
        label: "민감 개인정보 수집/이용에 동의",
        href: "/privacy#article-3",
    },
] as const;

export function SocialSignupForm({
    email,
    initialName,
    next,
}: {
    email: string;
    initialName: string;
    next: string;
}) {
    const router = useRouter();
    const [submitting, setSubmitting] = useState(false);
    const {
        register,
        handleSubmit,
        setValue,
        clearErrors,
        control,
        formState: { errors },
    } = useForm<SocialSignupValues>({
        resolver: zodResolver(socialSignupSchema),
        defaultValues: {
            name: initialName,
            phone: "",
            agreeService: false,
            agreePrivacy: false,
            agreePersonal: false,
            agreeSensitive: false,
        },
    });
    const values = useWatch({ control });
    const agreementsError = (errors as Record<string, { message?: string }>)
        .agreements?.message;

    const onSubmit = async (input: SocialSignupValues) => {
        if (submitting) return;
        setSubmitting(true);
        const result = await completeSocialSignup(input, next);
        if (!result.ok) {
            toast.error(result.message);
            setSubmitting(false);
            return;
        }
        router.replace(result.redirectTo);
        router.refresh();
    };

    return (
        <div className="mx-auto w-full max-w-lg">
            <div className="text-center">
                <h1 className="text-foreground text-3xl font-extrabold">
                    가입 정보 확인
                </h1>
                <p className="text-description-foreground mt-3">
                    서비스 이용에 필요한 정보와 동의를 완료해 주세요.
                </p>
            </div>

            <form
                onSubmit={handleSubmit(onSubmit)}
                noValidate
                className="border-border bg-card mt-10 space-y-6 rounded-2xl border p-6 sm:p-8"
            >
                <div className="space-y-2">
                    <Label htmlFor="social-email">이메일</Label>
                    <Input id="social-email" value={email} disabled />
                    <p className="text-muted-foreground text-sm">
                        소셜 계정에서 확인된 이메일은 이 화면에서 변경할 수
                        없어요.
                    </p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="social-name">이름</Label>
                    <Input
                        id="social-name"
                        autoComplete="name"
                        aria-invalid={!!errors.name}
                        {...register("name")}
                    />
                    {errors.name && (
                        <p className="text-destructive text-sm">
                            {errors.name.message}
                        </p>
                    )}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="social-phone">휴대폰번호</Label>
                    <Input
                        id="social-phone"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="010-1234-5678"
                        aria-invalid={!!errors.phone}
                        {...register("phone", {
                            onChange: (event) => {
                                event.target.value = formatPhoneNumber(
                                    event.target.value,
                                );
                            },
                        })}
                    />
                    {errors.phone && (
                        <p className="text-destructive text-sm">
                            {errors.phone.message}
                        </p>
                    )}
                </div>

                <div className="space-y-3 pt-1">
                    {AGREEMENTS.map((item) => (
                        <div
                            key={item.name}
                            className="flex items-center gap-2"
                        >
                            <label className="flex items-center gap-2">
                                <Checkbox
                                    checked={values[item.name] ?? false}
                                    onCheckedChange={(checked) => {
                                        setValue(item.name, checked === true);
                                        if (agreementsError)
                                            clearErrors("agreements" as never);
                                    }}
                                />
                                <span className="text-foreground text-sm">
                                    {item.label}
                                </span>
                            </label>
                            <Link
                                href={item.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
                            >
                                [보기]
                            </Link>
                        </div>
                    ))}
                    {agreementsError && (
                        <p className="text-destructive text-sm">
                            {agreementsError}
                        </p>
                    )}
                </div>

                <button
                    type="submit"
                    disabled={submitting}
                    aria-busy={submitting}
                    className="bg-brand text-brand-foreground hover:bg-brand/90 flex h-12 w-full items-center justify-center gap-2 rounded-lg text-base font-bold disabled:opacity-60"
                >
                    {submitting && <Loader2 className="size-5 animate-spin" />}
                    {submitting ? "처리 중…" : "가입 완료"}
                </button>
            </form>
        </div>
    );
}
