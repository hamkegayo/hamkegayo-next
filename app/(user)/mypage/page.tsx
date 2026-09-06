import Link from "next/link";
import { Building2, Car, Check, ChevronRight, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { AutoRefresh } from "@/components/auto-refresh";
import { getSessionProfile } from "./_lib/profile";
import { getMyReservations } from "./_lib/reservations.server";
import { UnpaidCharges } from "./_components/unpaid-charges";

const STEPS: { label: string; icon: LucideIcon }[] = [
    { label: "파트너 확정", icon: UserRound },
    { label: "서비스 진행", icon: Car },
    { label: "서비스 완료", icon: Check },
];

export default async function MypageHome() {
    const [{ profile }, { current, recent }] = await Promise.all([
        getSessionProfile(),
        getMyReservations(),
    ]);
    const name = profile?.name ?? "회원";

    // 진행 단계 인덱스(실제 서비스 상태 기반): 0=파트너 확정, 1=서비스 진행, 2=서비스 완료
    const currentStep = current?.stepIndex ?? 0;

    return (
        <div>
            <AutoRefresh />
            <h1 className="text-foreground text-2xl font-extrabold md:text-3xl">
                안녕하세요, {name}님
            </h1>
            <p className="text-muted-foreground mt-2">
                현재 예약 현황과 내 정보를 확인하세요.
            </p>

            {/* 미결제 안내 — 있을 때만 뜬다 (#75 · 약관 제22조) */}
            <UnpaidCharges />

            {/* 현재 진행 중인 예약 */}
            <h2 className="text-foreground mt-10 text-lg font-bold">
                현재 진행 중인 예약
            </h2>
            {current ? (
                <div className="border-border bg-background mt-4 grid overflow-hidden rounded-2xl border md:grid-cols-2">
                    {/* 예약 정보 */}
                    <div className="border-border border-b p-6 md:border-r md:border-b-0 md:p-8">
                        <span className="bg-brand/10 text-brand inline-block rounded-full px-3 py-1 text-xs font-bold">
                            {current.statusLabel}
                        </span>
                        <h3 className="text-foreground mt-4 text-xl font-extrabold">
                            {current.hospital}
                        </h3>
                        <p className="text-muted-foreground mt-3 text-sm">
                            {current.datetimeLabel}
                        </p>
                        <p className="text-muted-foreground mt-1 text-sm">
                            {current.planLabel}
                        </p>
                        <Link
                            href={`/mypage/reservations/${current.id}`}
                            className="border-border bg-background text-foreground hover:bg-muted mt-6 inline-flex rounded-lg border px-4 py-2.5 text-sm font-bold transition-colors"
                        >
                            예약 상세보기
                        </Link>
                    </div>

                    {/* 진행 단계 */}
                    <div className="flex items-start justify-between p-6 md:p-8">
                        {STEPS.map((s, i) => {
                            const Icon = s.icon;
                            const done = i <= currentStep;
                            const active = i === currentStep;
                            return (
                                <div
                                    key={s.label}
                                    className="flex flex-1 items-start"
                                >
                                    <div className="flex flex-1 flex-col items-center gap-2 text-center">
                                        <div
                                            className={cn(
                                                "flex size-11 items-center justify-center rounded-full",
                                                done
                                                    ? "bg-brand text-brand-foreground"
                                                    : "bg-muted text-muted-foreground",
                                            )}
                                        >
                                            <Icon className="size-5" />
                                        </div>
                                        <span
                                            className={cn(
                                                "text-sm font-semibold",
                                                done
                                                    ? "text-foreground"
                                                    : "text-muted-foreground",
                                            )}
                                        >
                                            {s.label}
                                        </span>
                                        <span
                                            className={cn(
                                                "text-xs",
                                                active
                                                    ? "text-brand"
                                                    : "text-muted-foreground",
                                            )}
                                        >
                                            {active
                                                ? "현재 단계"
                                                : done
                                                  ? "완료"
                                                  : "예정"}
                                        </span>
                                    </div>
                                    {i < STEPS.length - 1 && (
                                        <div className="bg-border mt-5 h-px flex-1" />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div className="border-border bg-background mt-4 flex flex-col items-center gap-3 rounded-2xl border px-6 py-14 text-center">
                    <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
                        <Building2 className="size-6" />
                    </span>
                    <p className="text-foreground font-bold">
                        진행 중인 예약이 없어요
                    </p>
                    <p className="text-muted-foreground text-sm">
                        병원 동행이 필요하시면 예약을 시작해 보세요.
                    </p>
                    <Link
                        href="/reservation"
                        className="bg-brand text-brand-foreground hover:bg-brand/90 mt-2 rounded-lg px-5 py-2.5 text-sm font-bold transition-colors"
                    >
                        예약하기
                    </Link>
                </div>
            )}

            {/* 최근 예약 내역 */}
            <h2 className="text-foreground mt-10 text-lg font-bold">
                최근 예약 내역
            </h2>
            {recent.length > 0 ? (
                <div className="divide-border border-border bg-background mt-4 divide-y overflow-hidden rounded-2xl border">
                    {recent.map((r) => (
                        <div
                            key={r.id}
                            className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"
                        >
                            <div className="flex items-center gap-4">
                                <div className="bg-brand/10 text-brand flex size-12 shrink-0 items-center justify-center rounded-xl">
                                    <Building2 className="size-6" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-foreground font-bold">
                                        {r.hospital}
                                    </p>
                                    <p className="text-muted-foreground mt-1 text-sm">
                                        {r.datetimeLabel}
                                    </p>
                                    <p className="text-muted-foreground mt-0.5 text-sm">
                                        {r.planLabel}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 self-end sm:self-auto">
                                <span className="text-muted-foreground text-sm font-semibold">
                                    {r.statusLabel}
                                </span>
                                {r.status === "COMPLETED" && (
                                    <Link
                                        href="/review/write"
                                        className="bg-brand text-brand-foreground hover:bg-brand/90 rounded-lg px-4 py-2 text-sm font-bold transition-colors"
                                    >
                                        후기 작성
                                    </Link>
                                )}
                                <Link
                                    href={`/mypage/reservations/${r.id}`}
                                    aria-label="예약 상세보기"
                                    className="text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <ChevronRight className="size-5" />
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="border-border bg-background text-muted-foreground mt-4 rounded-2xl border px-6 py-10 text-center text-sm">
                    아직 완료된 예약 내역이 없어요.
                </div>
            )}
        </div>
    );
}
