"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";

import { Section } from "@/app/(user)/_components/home/section";
import { Input } from "@/components/ui/input";
import { useReservationStore, PLAN_INFO } from "../_store/reservation-store";
import { StepBand } from "./step-band";

/**
 * STEP7 · 선결제.
 *
 *  약관 제9조 ④ — 파트너를 고르고 선결제를 마친 시점에 예약이 확정된다.
 *  파트너 선택 시 30분 기한이 걸리고, 결제창에 들어가면 서버가 +10분 연장한다.
 *
 *  ⚠️ 결제창은 **전체 페이지 이동**이다. 여기서 스토어는 날아가고,
 *     승인 라우트가 `?pay=&rid=` 로 돌려보내면 ReservationFlow 가 DB 에서 복원한다.
 */

const SDK_URL = "https://pay.nicepay.co.kr/v1/js/";

type PrepareResponse = {
    orderId: string;
    amount: number;
    grossAmount: number;
    discountAmount: number;
    goodsName: string;
    clientId: string;
    paymentDeadline: string;
    error?: string;
    code?: string;
};

declare global {
    interface Window {
        AUTHNICE?: {
            requestPay: (options: Record<string, unknown>) => void;
        };
    }
}

/** 남은 시간 mm:ss */
function formatRemain(ms: number): string {
    if (ms <= 0) return "00:00";
    const total = Math.floor(ms / 1000);
    const m = String(Math.floor(total / 60)).padStart(2, "0");
    const s = String(total % 60).padStart(2, "0");
    return `${m}:${s}`;
}

export function StepPayment() {
    const { data, patch, goStep } = useReservationStore();
    const plan = PLAN_INFO[data.plan || "basic"];

    const [sdkReady, setSdkReady] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [pointsInput, setPointsInput] = useState("");
    const [remain, setRemain] = useState<number | null>(null);
    const expiredRef = useRef(false);

    const gross = data.prepaidAmount;
    const balance = data.pointBalance;

    // 입력한 포인트는 잔액과 결제액을 넘을 수 없다. 서버가 다시 검증한다.
    const points = Math.max(
        0,
        Math.min(
            Number(pointsInput.replace(/\D/g, "")) || 0,
            balance,
            // 전액을 포인트로 덮으면 승인 금액이 0원이 되어 PG 가 거절한다.
            Math.max(gross - 1, 0),
        ),
    );
    const charge = gross - points;

    // ---------- 카운트다운 ----------
    useEffect(() => {
        if (!data.paymentDeadline) return;
        const deadline = new Date(data.paymentDeadline).getTime();

        const tick = () => {
            const left = deadline - Date.now();
            setRemain(left);

            // 기한이 지나면 파트너 선택이 풀린다 → 재선택 화면으로 되돌린다.
            if (left <= 0 && !expiredRef.current) {
                expiredRef.current = true;
                toast.error(
                    "결제 시간이 지나 파트너 선택이 해제되었습니다. 다시 선택해 주세요.",
                );
                goStep(6);
            }
        };

        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [data.paymentDeadline, goStep]);

    // ---------- 결제창 호출 ----------
    const onPay = useCallback(async () => {
        if (submitting || !sdkReady) return;
        setSubmitting(true);

        try {
            // 금액은 서버가 예약에서 재계산한다. 여기서는 사용할 포인트만 넘긴다.
            const res = await fetch("/api/payments/prepare", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    reservationId: data.reservationId,
                    pointsToUse: points,
                }),
            });

            const body = (await res.json()) as PrepareResponse;

            if (!res.ok) {
                toast.error(body.error ?? "결제를 시작할 수 없습니다.");
                // 선택이 풀렸거나 기한이 지난 경우 → 파트너 재선택으로
                if (
                    body.code === "PAYMENT_EXPIRED" ||
                    body.code === "PARTNER_NOT_SELECTED"
                ) {
                    goStep(6);
                }
                return;
            }

            // 서버가 기한을 +10분 연장했다. 카운트다운도 함께 갱신한다.
            patch({ paymentDeadline: body.paymentDeadline });

            if (!window.AUTHNICE) {
                toast.error(
                    "결제 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.",
                );
                return;
            }

            window.AUTHNICE.requestPay({
                clientId: body.clientId,
                method: "card",
                orderId: body.orderId,
                amount: body.amount,
                goodsName: body.goodsName,
                returnUrl: `${window.location.origin}/api/payments/confirm`,
                fnError: (result: { errorMsg?: string }) => {
                    toast.error(result?.errorMsg ?? "결제가 취소되었습니다.");
                    setSubmitting(false);
                },
            });
            // 성공 시 결제창으로 이동하므로 여기서 로딩을 풀지 않는다.
        } catch {
            toast.error(
                "결제를 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.",
            );
            setSubmitting(false);
        }
    }, [submitting, sdkReady, data.reservationId, points, patch, goStep]);

    const urgent = remain !== null && remain <= 5 * 60 * 1000;

    return (
        <>
            <Script
                src={SDK_URL}
                strategy="afterInteractive"
                onReady={() => setSdkReady(true)}
                onError={() => toast.error("결제 모듈을 불러오지 못했습니다.")}
            />

            <StepBand
                index={7}
                title="결제를 진행해주세요."
                subtitles={[
                    "선결제가 완료되면 예약이 확정됩니다.",
                    "카드 정보는 결제사가 직접 처리하며 저희는 저장하지 않습니다.",
                ]}
            />

            <Section>
                <div className="mx-auto max-w-xl">
                    {/* 남은 시간 */}
                    <div
                        className={
                            urgent
                                ? "flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 px-5 py-4 dark:border-red-900/50 dark:bg-red-950/30"
                                : "border-border bg-muted/30 flex items-center justify-between rounded-2xl border px-5 py-4"
                        }
                    >
                        <div className="flex items-center gap-2">
                            <Clock
                                className={
                                    urgent
                                        ? "size-5 text-red-600 dark:text-red-400"
                                        : "text-muted-foreground size-5"
                                }
                            />
                            <span className="text-foreground text-sm font-semibold">
                                결제 남은 시간
                            </span>
                        </div>
                        <span
                            className={
                                urgent
                                    ? "text-xl font-extrabold text-red-600 tabular-nums dark:text-red-400"
                                    : "text-foreground text-xl font-extrabold tabular-nums"
                            }
                        >
                            {remain === null ? "--:--" : formatRemain(remain)}
                        </span>
                    </div>

                    <p className="text-muted-foreground mt-2 flex items-start gap-1.5 text-xs leading-relaxed">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                        시간 안에 결제하지 않으면 파트너 선택이 해제되고 다시
                        선택하셔야 합니다. 결제창에 들어가면 10분이 연장됩니다.
                    </p>

                    {/* 선택한 파트너 */}
                    {data.confirmedPartnerName && (
                        <div className="border-border bg-background mt-6 rounded-2xl border p-5">
                            <p className="text-muted-foreground text-sm">
                                선택한 파트너
                            </p>
                            <p className="text-foreground mt-1 text-lg font-bold">
                                {data.confirmedPartnerName}
                            </p>
                        </div>
                    )}

                    {/* 결제 금액 */}
                    <div className="bg-muted/30 mt-4 rounded-2xl p-6">
                        <h2 className="text-foreground text-lg font-bold">
                            결제 금액
                        </h2>

                        <div className="border-border mt-4 space-y-2.5 border-b pb-4 text-sm">
                            <div className="text-muted-foreground flex items-center justify-between">
                                <span>선결제 금액 ({plan.label})</span>
                                <span className="text-foreground font-semibold">
                                    {gross.toLocaleString()}원
                                </span>
                            </div>
                            {points > 0 && (
                                <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                                    <span>포인트 사용</span>
                                    <span className="font-semibold">
                                        −{points.toLocaleString()}원
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="mt-4 flex items-center justify-between">
                            <span className="text-foreground font-bold">
                                최종 결제 금액
                            </span>
                            <span className="text-brand text-2xl font-extrabold">
                                {charge.toLocaleString()}원
                            </span>
                        </div>
                    </div>

                    {/* 포인트 사용 */}
                    {balance > 0 && (
                        <div className="border-border bg-background mt-4 rounded-2xl border p-5">
                            <div className="flex items-center justify-between">
                                <label
                                    htmlFor="points"
                                    className="text-foreground text-sm font-semibold"
                                >
                                    포인트 사용
                                </label>
                                <span className="text-muted-foreground text-sm">
                                    보유 {balance.toLocaleString()}P
                                </span>
                            </div>
                            <div className="mt-2 flex gap-2">
                                <Input
                                    id="points"
                                    inputMode="numeric"
                                    placeholder="0"
                                    value={pointsInput}
                                    onChange={(e) =>
                                        setPointsInput(e.target.value)
                                    }
                                    disabled={submitting}
                                />
                                <button
                                    type="button"
                                    onClick={() =>
                                        setPointsInput(
                                            String(
                                                Math.min(
                                                    balance,
                                                    Math.max(gross - 1, 0),
                                                ),
                                            ),
                                        )
                                    }
                                    disabled={submitting}
                                    className="border-border bg-background text-foreground hover:bg-muted shrink-0 rounded-lg border px-4 text-sm font-bold transition-colors disabled:opacity-60"
                                >
                                    전액
                                </button>
                            </div>
                            <p className="text-muted-foreground mt-2 text-xs">
                                1P = 1원. 결제 금액 전액을 포인트로 결제할 수는
                                없습니다.
                            </p>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={onPay}
                        disabled={submitting || !sdkReady || charge <= 0}
                        className="bg-brand text-brand-foreground hover:bg-brand/90 mt-6 w-full rounded-lg px-6 py-4 text-base font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {submitting
                            ? "결제창을 여는 중…"
                            : !sdkReady
                              ? "결제 모듈 준비 중…"
                              : `${charge.toLocaleString()}원 결제하기`}
                    </button>

                    <button
                        type="button"
                        onClick={() => goStep(6)}
                        disabled={submitting}
                        className="border-border bg-background text-foreground hover:bg-muted mt-3 w-full rounded-lg border px-6 py-3 text-sm font-bold transition-colors disabled:opacity-60"
                    >
                        파트너 다시 선택
                    </button>
                </div>
            </Section>
        </>
    );
}
