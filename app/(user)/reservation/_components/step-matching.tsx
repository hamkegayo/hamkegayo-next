"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, Search, Send, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Section } from "@/app/(user)/_components/home/section";
import { useReservationStore } from "../_store/reservation-store";
import {
    cancelReservation,
    getReservationApplicantsDetailed,
    type DetailedApplicant,
} from "../_actions/matching";
import { StepBand } from "./step-band";

const POLL_MS = 5000;

export function StepMatching() {
    const { data, next } = useReservationStore();
    const reservationId = data.reservationId;

    const [applicants, setApplicants] = useState<DetailedApplicant[]>([]);
    const [cancelling, setCancelling] = useState(false);
    const router = useRouter();

    const accepted = applicants.length;

    // 실제 지원자 폴링 (즉시 1회 + 주기)
    useEffect(() => {
        if (!reservationId) return;
        let active = true;
        const run = async () => {
            const list = await getReservationApplicantsDetailed(reservationId);
            if (active) setApplicants(list);
        };
        run();
        const id = setInterval(() => {
            if (document.visibilityState === "visible") run();
        }, POLL_MS);
        return () => {
            active = false;
            clearInterval(id);
        };
    }, [reservationId]);

    const progress = accepted > 0 ? 60 : 25;

    const onNext = () => {
        if (accepted < 1) {
            toast.info("아직 수락한 파트너가 없습니다. 잠시만 기다려 주세요.");
            return;
        }
        next();
    };

    const onCancel = async () => {
        if (cancelling || !reservationId) return;
        setCancelling(true);
        try {
            const res = await cancelReservation(reservationId);
            if (res.ok) {
                toast.success("매칭 요청을 취소했습니다.");
                router.push("/");
            } else {
                toast.error(res.message);
            }
        } finally {
            setCancelling(false);
        }
    };

    return (
        <>
            <StepBand
                index={5}
                title="파트너를 찾고 있습니다."
                subtitles={[
                    "입력하신 조건에 맞는 파트너에게 요청을 전달했어요.",
                    "수락한 파트너가 있으면 바로 선택하거나, 더 기다릴 수 있습니다.",
                ]}
            />

            <Section>
                <div className="mx-auto max-w-3xl">
                    <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
                        {/* 헤더 */}
                        <div className="flex items-start gap-4">
                            <div className="bg-brand/10 text-brand flex size-12 shrink-0 items-center justify-center rounded-full">
                                <Search className="size-6" />
                            </div>
                            <div>
                                <h2 className="text-foreground text-lg font-bold">
                                    추천 파트너에게 매칭 요청을 보냈어요
                                </h2>
                                <p className="text-muted-foreground mt-1 text-sm">
                                    조건에 맞는 파트너가 수락하면 바로
                                    알려드릴게요.
                                </p>
                            </div>
                        </div>

                        {/* 통계 2칸 */}
                        <div className="mt-6 grid grid-cols-2 gap-3">
                            {[
                                {
                                    icon: Send,
                                    label: "매칭 요청",
                                    value: "전송 완료",
                                },
                                {
                                    icon: Check,
                                    label: "수락한 파트너",
                                    value: `${accepted}명`,
                                    isNew: accepted > 0,
                                },
                            ].map(({ icon: Icon, label, value, isNew }) => (
                                <div
                                    key={label}
                                    className="border-border bg-background rounded-xl border p-4 text-center"
                                >
                                    <Icon className="text-brand mx-auto size-5" />
                                    <p className="text-muted-foreground mt-2 flex items-center justify-center gap-1.5 text-sm">
                                        {label}
                                        {isNew && (
                                            <span className="bg-brand text-brand-foreground rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                                                NEW
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-foreground mt-1 text-xl font-extrabold">
                                        {value}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* 진행률 */}
                        <div className="mt-6">
                            <div className="bg-border h-2 overflow-hidden rounded-full">
                                <div
                                    className="bg-brand h-full rounded-full transition-all duration-500"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <div className="mt-2 flex items-center justify-between text-sm">
                                <span className="text-foreground font-semibold">
                                    매칭 진행 중
                                </span>
                                <span className="text-brand font-bold">
                                    {progress}%
                                </span>
                            </div>
                        </div>

                        {/* 수락 알림 */}
                        {accepted > 0 && (
                            <div className="bg-brand/5 mt-5 flex items-start gap-3 rounded-xl p-4">
                                <Bell className="text-brand size-5 shrink-0" />
                                <div>
                                    <p className="text-foreground font-bold">
                                        파트너 {accepted}명이 매칭을 수락했어요!
                                    </p>
                                    <p className="text-muted-foreground mt-0.5 text-sm">
                                        지금 선택하시거나, 더 많은 파트너의
                                        수락을 기다릴 수 있어요.
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="bg-border my-5 h-px" />

                        {/* 수락 목록 */}
                        <p className="text-foreground font-bold">
                            현재 수락한 파트너{" "}
                            <span className="text-brand">({accepted})</span>
                        </p>
                        <p className="text-muted-foreground mt-1 text-sm">
                            새로운 수락자가 생기면 실시간으로 목록에
                            업데이트됩니다.
                        </p>

                        {accepted > 0 ? (
                            <ul className="mt-4 space-y-3">
                                {applicants.map((a) => (
                                    <li
                                        key={a.partnerId}
                                        className="border-border bg-background flex items-center gap-4 rounded-xl border p-4"
                                    >
                                        <div className="bg-muted flex size-12 shrink-0 items-center justify-center rounded-full">
                                            <UserRound className="text-muted-foreground size-6" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-foreground flex items-center gap-1.5 font-bold">
                                                {a.name}
                                                {a.rating !== null && (
                                                    <span className="text-muted-foreground text-sm font-semibold">
                                                        ★ {a.rating.toFixed(1)}{" "}
                                                        ({a.reviewCount})
                                                    </span>
                                                )}
                                            </p>
                                            {a.qualifications.length > 0 && (
                                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                                    {a.qualifications.map(
                                                        (q, i) => (
                                                            <span
                                                                key={`${a.partnerId}-${i}`}
                                                                className="bg-muted text-foreground rounded-md px-2 py-0.5 text-xs"
                                                            >
                                                                {q.type}
                                                            </span>
                                                        ),
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <span className="text-muted-foreground shrink-0 self-start text-xs">
                                            {a.appliedAtLabel} 수락
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="border-border bg-background text-muted-foreground mt-4 rounded-xl border border-dashed p-8 text-center text-sm">
                                아직 수락한 파트너가 없습니다. 잠시만 기다려
                                주세요.
                            </div>
                        )}
                    </div>

                    {/* 네비 */}
                    <div className="flex flex-wrap justify-center gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={cancelling}
                            className="border-border bg-background text-foreground hover:bg-muted rounded-lg border px-6 py-3 text-sm font-bold transition-colors disabled:opacity-60"
                        >
                            취소 요청
                        </button>
                        <button
                            type="button"
                            onClick={onNext}
                            disabled={accepted < 1}
                            className="bg-brand text-brand-foreground hover:bg-brand/90 rounded-lg px-6 py-3 text-sm font-bold transition-colors disabled:opacity-50"
                        >
                            다음 단계로 이동
                        </button>
                    </div>

                    {/* 안내 */}
                    <p className="text-muted-foreground mt-3 text-center text-xs">
                        파트너가 수락하면 이 화면에서 바로 선택할 수 있어요.
                        진료일이 지나도록 확정하지 않으면 예약은 자동
                        취소됩니다.
                    </p>
                </div>
            </Section>
        </>
    );
}
