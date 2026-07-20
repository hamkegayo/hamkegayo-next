"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

const CONTACTS = [
    { label: "전화 상담", value: "1588-1024", tel: "1588-1024" },
    { label: "카카오톡 채널", value: "함께가요 고객센터" },
    { label: "이메일", value: "help@hamkkegayo.co.kr" },
    {
        label: "문의 유형",
        value: "예약 변경 / 파트너 검증 / 리포트 / 환불 / 개인정보",
    },
];

const PRINCIPLES = [
    "비의료 범위만 안내하고 진단이나 복약 상담은 하지 않습니다.",
    "건강정보는 필요한 범위만 확인하고 별도 동의 후 처리합니다.",
    "민감한 사고나 클레임은 전담 담당자가 우선 응대합니다.",
    "예약 전에는 서비스 유형과 파트너 적합도를 먼저 안내합니다.",
];

const FAQS: { q: string; a: string }[] = [
    {
        q: "의료행위도 해주나요?",
        a: "아닙니다. 함께가요는 비의료 동행, 행정 보조, 정보 정리만 수행하고 진단·복약지도·처치 판단은 하지 않습니다.",
    },
    {
        q: "어떤 서비스 유형을 골라야 하나요?",
        a: "병원 내 진료 동행만 필요하면 베이직, 자택 픽업·귀가까지 필요하면 플러스를 추천드립니다. 예약 시 상황을 입력하시면 적합한 유형을 안내해 드립니다.",
    },
    {
        q: "파트너 경력은 어디까지 확인하나요?",
        a: "자격, 동행 경험 건수, 평점, 검증 배지, 시간 준수율 등 상세 지표를 예약 화면에서 직접 확인하실 수 있습니다.",
    },
    {
        q: "긴급 상황이면 어떻게 하나요?",
        a: "응급상황은 119 또는 의료기관 대응이 최우선입니다. 파트너는 즉시 공공 응급체계를 이용하도록 돕고, 동시에 보호자에게 연락드립니다.",
    },
];

function Card({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "border-border bg-background rounded-2xl border p-6 md:p-7",
                className,
            )}
        >
            {children}
        </div>
    );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
    return (
        <p className="text-brand text-xs font-bold tracking-widest">
            {children}
        </p>
    );
}

export default function MypageSupport() {
    // 한 번에 하나만 열림 (-1 = 전부 접힘). 기본은 첫 항목 열림.
    const [open, setOpen] = useState(0);

    const toggle = (i: number) => setOpen((prev) => (prev === i ? -1 : i));

    const notReady = () => toast.info("준비 중인 기능입니다.");

    return (
        <div>
            {/* 상단: 소개 + 상담 가능 */}
            <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
                <Card>
                    <Eyebrow>CUSTOMER CENTER</Eyebrow>
                    <h1 className="text-foreground mt-2 text-2xl font-extrabold md:text-3xl">
                        고객센터
                    </h1>
                    <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
                        예약 전 문의, 파트너 검증, 서비스 유형 선택, 개인정보와
                        리포트 관련 문의까지 고객이 가장 자주 묻는 내용을 한곳에
                        모았습니다.
                    </p>
                </Card>
                <Card>
                    <p className="text-muted-foreground text-sm">상담 가능</p>
                    <p className="text-foreground mt-3 font-bold">
                        평일 08:00 ~ 20:00
                    </p>
                    <p className="text-foreground mt-3 font-bold">
                        토요일 09:00 ~ 15:00
                    </p>
                </Card>
            </div>

            {/* 상담 채널 + 응대 원칙 */}
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <Card>
                    <Eyebrow>CONTACT</Eyebrow>
                    <h2 className="text-foreground mt-2 text-lg font-bold">
                        상담 채널
                    </h2>
                    <div className="mt-4 space-y-3">
                        {CONTACTS.map((c) => (
                            <div
                                key={c.label}
                                className="bg-muted/40 text-foreground rounded-lg px-4 py-3 text-sm"
                            >
                                <span className="text-muted-foreground font-medium">
                                    {c.label}:{" "}
                                </span>
                                {c.tel ? (
                                    <a
                                        href={`tel:${c.tel}`}
                                        className="text-foreground hover:text-brand font-bold"
                                    >
                                        {c.value}
                                    </a>
                                ) : (
                                    <span className="font-bold">{c.value}</span>
                                )}
                            </div>
                        ))}
                    </div>
                </Card>

                <Card>
                    <Eyebrow>CARE FLOW</Eyebrow>
                    <h2 className="text-foreground mt-2 text-lg font-bold">
                        응대 원칙
                    </h2>
                    <ul className="mt-4 space-y-3">
                        {PRINCIPLES.map((p) => (
                            <li
                                key={p}
                                className="text-muted-foreground flex gap-2 text-sm leading-relaxed"
                            >
                                <span className="bg-brand mt-1.5 size-1.5 shrink-0 rounded-full" />
                                {p}
                            </li>
                        ))}
                    </ul>
                </Card>
            </div>

            {/* 자주 묻는 질문 */}
            <h2 className="text-foreground mt-10 text-lg font-bold">
                자주 묻는 질문
            </h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
                {FAQS.map((faq, i) => {
                    const isOpen = open === i;
                    return (
                        <div
                            key={faq.q}
                            className={cn(
                                "bg-background self-start rounded-xl border transition-colors",
                                isOpen ? "border-brand" : "border-border",
                            )}
                        >
                            <button
                                type="button"
                                onClick={() => toggle(i)}
                                aria-expanded={isOpen}
                                className="text-foreground flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-sm font-bold"
                            >
                                {faq.q}
                                <ChevronDown
                                    className={cn(
                                        "text-muted-foreground size-4 shrink-0 transition-transform",
                                        isOpen && "text-brand rotate-180",
                                    )}
                                />
                            </button>
                            <div
                                className={cn(
                                    "grid transition-[grid-template-rows] duration-200 ease-out",
                                    isOpen
                                        ? "grid-rows-[1fr]"
                                        : "grid-rows-[0fr]",
                                )}
                            >
                                <div className="overflow-hidden">
                                    <p
                                        className={cn(
                                            "text-muted-foreground px-5 pb-4 text-sm leading-relaxed transition-opacity duration-200",
                                            isOpen
                                                ? "opacity-100"
                                                : "opacity-0",
                                        )}
                                    >
                                        {faq.a}
                                    </p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* 하단 버튼 */}
            <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link
                    href="/reservation"
                    className="bg-brand text-brand-foreground hover:bg-brand/90 rounded-lg px-6 py-3 text-sm font-bold transition-colors"
                >
                    예약하기
                </Link>
                <Link
                    href="/service"
                    className="border-border bg-background text-foreground hover:bg-muted rounded-lg border px-6 py-3 text-sm font-bold transition-colors"
                >
                    서비스 소개 보기
                </Link>
                <button
                    type="button"
                    onClick={notReady}
                    className="border-border bg-background text-foreground hover:bg-muted rounded-lg border px-6 py-3 text-sm font-bold transition-colors"
                >
                    이용 후기 보기
                </button>
            </div>
        </div>
    );
}
