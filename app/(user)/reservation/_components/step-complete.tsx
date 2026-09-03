"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    CalendarDays,
    Check,
    House,
    MessageSquare,
    Phone,
    SquarePlus,
    UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Section } from "@/app/(user)/_components/home/section";
import { useReservationStore, PLAN_INFO } from "../_store/reservation-store";
import { StepBand } from "./step-band";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function formatVisit(dateStr: string, time: string) {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return time || "-";
    const wd = WEEKDAY[d.getDay()];
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}. ${m}. ${day} (${wd}) ${time}`.trim();
}

const NEXT_STEPS: { icon: LucideIcon; title: string; desc: string }[] = [
    {
        icon: MessageSquare,
        title: "1. 예약 확정 안내",
        desc: "예약 확정 및 세부 일정이 안내됩니다.",
    },
    {
        icon: Phone,
        title: "2. 사전 연락",
        desc: "파트너가 방문 전 연락드려 세부 사항을 안내드립니다.",
    },
    {
        icon: SquarePlus,
        title: "3. 병원 동행 서비스 진행",
        desc: "예약일 당일 약속된 시간에 파트너가 방문하여 병원 동행 서비스를 진행합니다.",
    },
    {
        icon: House,
        title: "4. 서비스 이용 완료",
        desc: "병원 동행 및 귀가 지원 후 서비스가 완료됩니다.",
    },
];

function InfoRow({ label, value }: { label: string; value?: string }) {
    return (
        <div className="flex gap-4 py-2 text-sm">
            <span className="text-muted-foreground w-16 shrink-0 font-semibold">
                {label}
            </span>
            <span className="text-foreground">{value || "-"}</span>
        </div>
    );
}

export function StepComplete() {
    const { data, finish } = useReservationStore();
    const plan = PLAN_INFO[data.plan || "basic"];
    const partnerName = data.confirmedPartnerName;

    // 예약이 완료된 시점부터 이 플로우는 끝난 것으로 본다.
    // 표시만 해두면 홈·예약현황 링크는 물론 브라우저 뒤로가기로 빠져나가도
    // 다음 진입 때 ReservationFlow 가 STEP1 부터 다시 시작한다.
    useEffect(() => {
        finish();
    }, [finish]);

    // 서버가 발급한 예약번호 사용 (없으면 표시용 임시 생성)
    const [reservationNo] = useState(() => {
        if (data.reservationCode) return data.reservationCode;
        const now = new Date();
        const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
        const rand = String(Math.floor(1000 + Math.random() * 9000));
        return `R${ymd}-${rand}`;
    });

    const statusHref = data.reservationId
        ? `/mypage/reservations/${data.reservationId}`
        : "/mypage";

    return (
        <>
            <StepBand
                index={7}
                title="예약이 확정되었습니다."
                subtitles={[
                    "선택하신 파트너와의 매칭이 확정되었습니다.",
                    "예약 정보와 다음 일정을 안내해드립니다.",
                ]}
            />

            <Section>
                <div className="mx-auto max-w-xl">
                    {/* 완료 헤더 */}
                    <div className="text-center">
                        <div className="bg-brand/10 text-brand mx-auto flex size-16 items-center justify-center rounded-full">
                            <Check className="size-8" strokeWidth={3} />
                        </div>
                        <h2 className="text-foreground mt-4 text-2xl font-extrabold">
                            예약이 확정되었습니다!
                        </h2>
                        <p className="text-muted-foreground mt-2">
                            이용해주셔서 감사합니다.
                        </p>
                    </div>

                    {/* 예약 번호 */}
                    <div className="border-border bg-background mt-8 rounded-2xl border p-6 text-center">
                        <p className="text-muted-foreground text-sm">
                            예약 번호
                        </p>
                        <p className="text-foreground mt-1 text-2xl font-extrabold">
                            {reservationNo}
                        </p>
                        <p className="text-muted-foreground mt-1 text-xs">
                            예약 번호는 예약 조회 및 문의시 필요합니다
                        </p>
                    </div>

                    {/* 확정 파트너 */}
                    {partnerName && (
                        <div className="border-border bg-background mt-4 rounded-2xl border p-6">
                            <p className="text-foreground flex items-center gap-2 font-bold">
                                <UserRound className="text-muted-foreground size-5" />
                                확정 파트너
                            </p>
                            <div className="mt-4 flex items-center gap-4">
                                <div className="bg-brand/10 text-brand flex size-14 shrink-0 items-center justify-center rounded-full">
                                    <UserRound className="size-7" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-foreground text-lg font-bold">
                                        {partnerName}
                                    </p>
                                    <p className="text-muted-foreground mt-0.5 text-sm">
                                        예약이 확정되었습니다.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 예약 정보 */}
                    <div className="border-border bg-background mt-4 rounded-2xl border p-6">
                        <p className="text-foreground flex items-center gap-2 font-bold">
                            <CalendarDays className="text-muted-foreground size-5" />
                            예약 정보
                        </p>
                        <div className="divide-border mt-4 divide-y">
                            <InfoRow label="서비스" value={plan.label} />
                            <InfoRow
                                label="방문일시"
                                value={formatVisit(
                                    data.useDate,
                                    data.reserveTime,
                                )}
                            />
                            <InfoRow
                                label="병원"
                                value={data.hospitalAddress}
                            />
                            <InfoRow label="이용자" value={data.userName} />
                            <InfoRow label="연락처" value={data.userPhone} />
                        </div>
                    </div>

                    {/* 다음 단계 안내 */}
                    <div className="border-border bg-background mt-4 rounded-2xl border p-6">
                        <p className="text-foreground font-bold">
                            다음 단계 안내
                        </p>
                        <div className="divide-border mt-4 divide-y">
                            {NEXT_STEPS.map(({ icon: Icon, title, desc }) => (
                                <div
                                    key={title}
                                    className="flex gap-3 py-4 first:pt-0 last:pb-0"
                                >
                                    <div className="bg-brand/10 text-brand flex size-9 shrink-0 items-center justify-center rounded-lg">
                                        <Icon className="size-4" />
                                    </div>
                                    <div>
                                        <p className="text-foreground font-bold">
                                            {title}
                                        </p>
                                        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                                            {desc}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 버튼 */}
                    <div className="mt-8 flex justify-center gap-3">
                        <Link
                            href="/"
                            className="border-border bg-background text-foreground hover:bg-muted rounded-lg border px-6 py-3 text-sm font-bold transition-colors"
                        >
                            홈으로 이동
                        </Link>
                        <Link
                            href={statusHref}
                            className="bg-brand text-brand-foreground hover:bg-brand/90 rounded-lg px-6 py-3 text-sm font-bold transition-colors"
                        >
                            예약 현황 보기
                        </Link>
                    </div>
                </div>
            </Section>
        </>
    );
}
