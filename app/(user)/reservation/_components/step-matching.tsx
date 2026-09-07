"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    AlertTriangle,
    Bell,
    Check,
    Search,
    Send,
    UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Section } from "@/app/(user)/_components/home/section";
import { useReservationStore } from "../_store/reservation-store";
import {
    cancelReservation,
    getMatchingState,
    type CancelReason,
    type DetailedApplicant,
} from "../_actions/matching";
import { StepBand } from "./step-band";

const POLL_MS = 5000;

/**
 * 취소 사유별 안내.
 *
 *  "취소되었습니다" 만으로는 자기가 취소한 것인지 시스템이 취소한 것인지
 *  알 수 없다. 사유를 함께 말해야 다음 행동이 정해진다.
 */
const CANCEL_NOTE: Record<NonNullable<CancelReason>, string> = {
    EXPIRED:
        "파트너가 정해지지 않은 채 서비스 시작 예정시각이 지나 자동으로 취소되었습니다. 다시 예약하실 때는 여유 있는 시간으로 선택해 주세요.",
    USER: "요청하신 대로 매칭을 취소했습니다.",
    REFUND: "결제 취소·환불 처리로 예약이 취소되었습니다.",
    ADMIN: "운영센터에서 예약을 취소했습니다. 자세한 내용은 고객센터로 문의해 주세요.",
};

export function StepMatching() {
    const { data, next, finish } = useReservationStore();
    const reservationId = data.reservationId;

    const [applicants, setApplicants] = useState<DetailedApplicant[]>([]);
    const [cancelling, setCancelling] = useState(false);
    /** 매칭이 끝난 경우(취소·확정 등). null 이면 아직 매칭 중이다. */
    const [closed, setClosed] = useState<{
        status: "CONFIRMED" | "CANCELLED" | "COMPLETED";
        reason: CancelReason;
    } | null>(null);
    const router = useRouter();

    const accepted = applicants.length;

    /*
     * 지원자와 **예약 상태**를 함께 읽는다 (즉시 1회 + 주기).
     *
     *  전에는 지원자만 읽었다. 그래서 예약이 자동 취소돼도 화면은 계속
     *  "매칭 진행 중" 을 보여줬다 — 취소된 예약에는 지원자가 없으니
     *  영영 0명이다. 실제로 프로덕션에서 그렇게 났다.
     */
    useEffect(() => {
        if (!reservationId) return;
        let active = true;
        let timer: ReturnType<typeof setInterval> | null = null;

        const run = async () => {
            const state = await getMatchingState(reservationId);
            if (!active) return;

            setApplicants(state.applicants);

            // 매칭이 끝난 건은 더 물어볼 것이 없다. 폴링을 멈춘다.
            if (state.status && state.status !== "MATCHING") {
                setClosed({
                    status: state.status,
                    reason: state.cancelReason,
                });
                if (timer) clearInterval(timer);
            }
        };

        run();
        timer = setInterval(() => {
            if (document.visibilityState === "visible") run();
        }, POLL_MS);
        return () => {
            active = false;
            if (timer) clearInterval(timer);
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
                // 끝난 플로우로 표시 — 다시 예약하기로 들어오면 STEP1 부터 시작한다.
                finish();
                router.push("/");
            } else {
                toast.error(res.message);
            }
        } finally {
            setCancelling(false);
        }
    };

    if (closed) {
        const cancelled = closed.status === "CANCELLED";
        return (
            <>
                <StepBand
                    index={5}
                    title={
                        cancelled
                            ? "예약이 취소되었습니다."
                            : "매칭이 종료되었습니다."
                    }
                    subtitles={[
                        cancelled
                            ? "아래 사유를 확인하고 다시 예약해 주세요."
                            : "예약 상태는 마이페이지에서 확인하실 수 있습니다.",
                    ]}
                />

                <Section>
                    <div className="mx-auto max-w-3xl">
                        <div className="border-border bg-background rounded-2xl border p-6 text-center md:p-8">
                            <span
                                aria-hidden
                                className="bg-muted text-muted-foreground mx-auto flex size-12 items-center justify-center rounded-full"
                            >
                                <AlertTriangle className="size-6" />
                            </span>
                            <h2 className="text-foreground mt-4 text-lg font-bold">
                                {cancelled
                                    ? "예약이 취소되었어요"
                                    : "더 이상 매칭 중이 아니에요"}
                            </h2>
                            <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                                {cancelled
                                    ? closed.reason
                                        ? CANCEL_NOTE[closed.reason]
                                        : "예약이 취소되었습니다. 자세한 내용은 고객센터로 문의해 주세요."
                                    : "예약 상태가 바뀌었습니다. 마이페이지에서 확인해 주세요."}
                            </p>

                            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                                <button
                                    type="button"
                                    onClick={() => {
                                        finish();
                                        router.push("/reservation");
                                    }}
                                    className="bg-brand text-brand-foreground hover:bg-brand/90 rounded-lg px-6 py-3 text-sm font-bold transition-colors"
                                >
                                    다시 예약하기
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        finish();
                                        router.push("/mypage");
                                    }}
                                    className="border-border bg-background text-foreground hover:bg-muted rounded-lg border px-6 py-3 text-sm font-bold transition-colors"
                                >
                                    마이페이지로
                                </button>
                            </div>
                        </div>
                    </div>
                </Section>
            </>
        );
    }

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
