import Link from "next/link";
import { Building2, Car, Check, ChevronRight, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { ComingSoonButton } from "@/app/(user)/_components/home/coming-soon-button";
import { getSessionProfile } from "./_lib/profile";
import { CURRENT_RESERVATION, RECENT_RESERVATIONS } from "./_lib/mock";

const STEPS: { label: string; icon: LucideIcon }[] = [
    { label: "파트너 확정", icon: UserRound },
    { label: "서비스 진행", icon: Car },
    { label: "서비스 완료", icon: Check },
];
// 현재 단계 인덱스 (매칭 대기중 → 파트너 확정 단계)
const CURRENT_STEP = 0;

export default async function MypageHome() {
    const { profile } = await getSessionProfile();
    const name = profile?.name ?? "회원";

    return (
        <div>
            <h1 className="text-foreground text-2xl font-extrabold md:text-3xl">
                안녕하세요, {name}님
            </h1>
            <p className="text-muted-foreground mt-2">
                현재 예약 현황과 내 정보를 확인하세요.
            </p>

            {/* 현재 진행 중인 예약 */}
            <h2 className="text-foreground mt-10 text-lg font-bold">
                현재 진행 중인 예약
            </h2>
            <div className="border-border bg-background mt-4 grid overflow-hidden rounded-2xl border md:grid-cols-2">
                {/* 예약 정보 */}
                <div className="border-border border-b p-6 md:border-r md:border-b-0 md:p-8">
                    <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-600 dark:bg-amber-500/15">
                        {CURRENT_RESERVATION.statusLabel}
                    </span>
                    <h3 className="text-foreground mt-4 text-xl font-extrabold">
                        {CURRENT_RESERVATION.hospital}
                    </h3>
                    <p className="text-muted-foreground mt-3 text-sm">
                        {CURRENT_RESERVATION.datetime}
                    </p>
                    <p className="text-muted-foreground mt-1 text-sm">
                        {CURRENT_RESERVATION.plan}
                    </p>
                    <Link
                        href="/mypage/reservations/current"
                        className="border-border bg-background text-foreground hover:bg-muted mt-6 inline-flex rounded-lg border px-4 py-2.5 text-sm font-bold transition-colors"
                    >
                        예약 상세보기
                    </Link>
                </div>

                {/* 진행 단계 */}
                <div className="flex items-start justify-between p-6 md:p-8">
                    {STEPS.map((s, i) => {
                        const Icon = s.icon;
                        const active = i === CURRENT_STEP;
                        return (
                            <div
                                key={s.label}
                                className="flex flex-1 items-start"
                            >
                                <div className="flex flex-1 flex-col items-center gap-2 text-center">
                                    <div
                                        className={cn(
                                            "flex size-11 items-center justify-center rounded-full",
                                            active
                                                ? "bg-brand text-brand-foreground"
                                                : "bg-muted text-muted-foreground",
                                        )}
                                    >
                                        <Icon className="size-5" />
                                    </div>
                                    <span
                                        className={cn(
                                            "text-sm font-semibold",
                                            active
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
                                        {active ? "현재 단계" : "예정"}
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

            {/* 최근 예약 내역 */}
            <h2 className="text-foreground mt-10 text-lg font-bold">
                최근 예약 내역
            </h2>
            <div className="divide-border border-border bg-background mt-4 divide-y overflow-hidden rounded-2xl border">
                {RECENT_RESERVATIONS.map((r) => (
                    <div
                        key={r.id}
                        className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"
                    >
                        <div className="flex items-center gap-4">
                            <div className="bg-brand/10 text-brand flex size-12 shrink-0 items-center justify-center rounded-xl">
                                <Building2 className="size-6" />
                            </div>
                            <div>
                                <p className="text-foreground font-bold">
                                    {r.hospital}
                                </p>
                                <p className="text-muted-foreground mt-1 text-sm">
                                    {r.datetime}
                                </p>
                                <p className="text-muted-foreground mt-0.5 text-sm">
                                    {r.plan}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 self-end sm:self-auto">
                            <span className="text-muted-foreground text-sm font-semibold">
                                {r.statusLabel}
                            </span>
                            {r.review === "write" ? (
                                <ComingSoonButton className="bg-brand text-brand-foreground hover:bg-brand/90 rounded-lg px-4 py-2 text-sm font-bold transition-colors">
                                    후기 작성
                                </ComingSoonButton>
                            ) : (
                                <ComingSoonButton className="border-border bg-background text-foreground hover:bg-muted rounded-lg border px-4 py-2 text-sm font-bold transition-colors">
                                    후기 보기
                                </ComingSoonButton>
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
        </div>
    );
}
