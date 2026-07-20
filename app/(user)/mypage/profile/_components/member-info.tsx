"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

type Basic = {
    name: string;
    email: string;
    phone: string;
    phoneVerified: boolean;
};

const notReady = () => toast.info("준비 중인 기능입니다.");

function Card({
    title,
    action,
    children,
}: {
    title: string;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="border-border bg-background rounded-2xl border p-6 md:p-7">
            <div className="mb-5 flex items-center justify-between">
                <h2 className="text-foreground text-lg font-bold">{title}</h2>
                {action}
            </div>
            {children}
        </div>
    );
}

function OutlineButton({
    children,
    onClick,
}: {
    children: React.ReactNode;
    onClick?: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick ?? notReady}
            className="border-border bg-background text-foreground hover:bg-muted rounded-lg border px-3.5 py-2 text-sm font-bold transition-colors"
        >
            {children}
        </button>
    );
}

const AGREEMENTS = [
    { label: "서비스 이용 약관 동의", required: true },
    { label: "개인정보 수집 및 이용 동의", required: true },
    { label: "결제 이용 동의", required: true },
];

export function MemberInfo({ basic }: { basic: Basic }) {
    const [marketing, setMarketing] = useState(false);

    const infoRows = [
        { label: "이름", value: basic.name },
        { label: "이메일", value: basic.email },
        { label: "휴대폰번호", value: basic.phone, phone: true },
        { label: "비밀번호", value: "**********" },
    ];

    return (
        <div>
            <h1 className="text-foreground text-2xl font-extrabold md:text-3xl">
                회원 정보
            </h1>

            <div className="mt-6 space-y-5">
                {/* 기본 정보 */}
                <Card
                    title="기본 정보"
                    action={<OutlineButton>수정하기</OutlineButton>}
                >
                    <dl className="space-y-3">
                        {infoRows.map((r) => (
                            <div
                                key={r.label}
                                className="flex items-center gap-4 text-sm"
                            >
                                <dt className="text-muted-foreground w-24 shrink-0 font-semibold">
                                    {r.label}
                                </dt>
                                <dd className="text-foreground flex items-center gap-2 font-medium">
                                    {r.value}
                                    {r.phone &&
                                        (basic.phoneVerified ? (
                                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/15">
                                                인증 완료
                                            </span>
                                        ) : (
                                            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-semibold">
                                                미인증
                                            </span>
                                        ))}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </Card>

                {/* 결제 수단 관리 */}
                <Card
                    title="결제 수단 관리"
                    action={<OutlineButton>카드 추가하기</OutlineButton>}
                >
                    <p className="text-muted-foreground text-sm font-semibold">
                        등록된 카드
                    </p>
                    <div className="bg-muted/40 mt-3 flex items-center gap-4 rounded-xl p-4">
                        <div className="bg-brand/10 text-brand flex size-9 shrink-0 items-center justify-center rounded-lg">
                            <CreditCard className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-foreground font-bold">
                                신한카드
                            </p>
                            <p className="text-muted-foreground text-xs">
                                유효기간 08/27
                            </p>
                        </div>
                        <p className="text-foreground hidden text-sm font-semibold tracking-wider sm:block">
                            **** **** **** 1234
                        </p>
                        <span className="bg-background text-muted-foreground shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold">
                            기본 카드
                        </span>
                    </div>
                </Card>

                {/* 환자 정보 관리 */}
                <Card
                    title="환자 정보 관리"
                    action={<OutlineButton>환자 추가하기</OutlineButton>}
                >
                    <div className="bg-muted/40 flex items-center gap-3 rounded-xl p-4">
                        <div className="bg-muted size-11 shrink-0 rounded-full" />
                        <div className="min-w-0 flex-1 text-sm">
                            <span className="text-foreground font-bold">
                                김영희
                            </span>
                            <span className="text-muted-foreground">
                                {" "}
                                &nbsp;|&nbsp; 어머니 &nbsp;|&nbsp; 70세
                                &nbsp;|&nbsp; 여성
                            </span>
                        </div>
                        <div className="flex shrink-0 gap-2">
                            <OutlineButton>수정</OutlineButton>
                            <OutlineButton>삭제</OutlineButton>
                        </div>
                    </div>
                </Card>

                {/* 약관 동의 관리 */}
                <Card title="약관 동의 관리">
                    <div className="divide-border divide-y">
                        {AGREEMENTS.map((a) => (
                            <div
                                key={a.label}
                                className="flex items-center justify-between gap-3 py-3.5"
                            >
                                <span className="text-foreground text-sm font-medium">
                                    {a.label}
                                </span>
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-semibold text-emerald-600">
                                        동의 완료
                                    </span>
                                    <OutlineButton>약관 보기</OutlineButton>
                                </div>
                            </div>
                        ))}

                        {/* 마케팅 (토글) */}
                        <div className="flex items-center justify-between gap-3 py-3.5">
                            <span className="text-foreground text-sm font-medium">
                                마케팅 정보 수신 동의 (선택)
                            </span>
                            <div className="flex items-center gap-3">
                                <span
                                    className={cn(
                                        "text-sm font-semibold",
                                        marketing
                                            ? "text-emerald-600"
                                            : "text-muted-foreground",
                                    )}
                                >
                                    {marketing ? "동의 완료" : "미동의"}
                                </span>
                                <OutlineButton>약관 보기</OutlineButton>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMarketing((v) => !v);
                                        toast.success(
                                            marketing
                                                ? "마케팅 수신 동의를 철회했습니다."
                                                : "마케팅 수신에 동의했습니다.",
                                        );
                                    }}
                                    className={cn(
                                        "rounded-lg px-3.5 py-2 text-sm font-bold transition-colors",
                                        marketing
                                            ? "border-border bg-background text-foreground hover:bg-muted border"
                                            : "bg-brand text-brand-foreground hover:bg-brand/90",
                                    )}
                                >
                                    {marketing ? "철회하기" : "동의하기"}
                                </button>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}
