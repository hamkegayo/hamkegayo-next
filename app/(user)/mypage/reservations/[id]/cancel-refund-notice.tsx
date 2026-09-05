"use client";

import { AlertTriangle } from "lucide-react";

import type { RefundPreview } from "@/lib/payments/refund";

/**
 * 취소 확인 모달의 환불 안내 (#76) — 약관 제19조.
 *
 *  약관에 수수료 표가 공개돼 있어도, **취소 버튼 앞에서 자기 건이 어느
 *  구간인지 아는 사람은 없다.** 2시간 전 이내면 한 시간 요금이 남는데
 *  그걸 모른 채 누르게 두면 나중에 분쟁이 된다.
 *
 *  금액은 실제 환불과 같은 계산기(`previewCancelRefund`)에서 온다. 여기서
 *  다시 계산하지 않는다 — 안내와 집행이 갈라지면 안내가 거짓말이 된다.
 */

const BRACKET_NOTE: Record<RefundPreview["bracket"], string> = {
    FREE: "서비스 시작 24시간 이전 취소라 취소수수료가 없습니다.",
    FLAT: "서비스 시작 24시간 이내 취소로 취소수수료 10,000원이 발생합니다.",
    ONE_HOUR:
        "서비스 시작 2시간 전 이내 취소로 1시간 이용요금이 취소수수료로 발생합니다.",
    PROVIDER_FAULT: "회사·파트너 귀책 취소라 취소수수료가 없습니다.",
};

function Line({
    label,
    value,
    tone,
}: {
    label: string;
    value: string;
    tone?: "muted" | "strong";
}) {
    return (
        <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span
                className={
                    tone === "strong"
                        ? "text-foreground text-base font-extrabold"
                        : "text-foreground font-semibold"
                }
            >
                {value}
            </span>
        </div>
    );
}

const won = (n: number) => `${n.toLocaleString()}원`;

export function CancelRefundNotice({
    preview,
    loading,
}: {
    /** null 이면 환불할 선결제가 없다 — 결제 전 취소다 */
    preview: RefundPreview | null;
    loading: boolean;
}) {
    if (loading) {
        return (
            <div className="border-border mt-4 rounded-xl border px-4 py-5">
                <div className="bg-muted h-3 w-2/3 animate-pulse rounded" />
                <div className="bg-muted mt-3 h-3 w-1/2 animate-pulse rounded" />
            </div>
        );
    }

    if (!preview) {
        return (
            <p className="text-muted-foreground mt-4 text-left text-sm leading-relaxed">
                아직 결제가 완료되지 않은 예약이라 환불할 금액이 없습니다.
            </p>
        );
    }

    // 수수료가 실제 낸 현금보다 클 수 있다(포인트로 대부분 결제한 경우).
    // 그때도 추가로 청구하지 않는다 — 차액은 회사가 진다.
    const withheld = Math.min(preview.cancelFee, preview.paidCash);

    return (
        <div className="mt-4 text-left">
            <div className="border-border space-y-2.5 rounded-xl border px-4 py-4">
                <Line label="결제 금액" value={won(preview.paidCash)} />
                {preview.cancelFee > 0 && (
                    <Line label="취소수수료" value={`- ${won(withheld)}`} />
                )}
                <div className="border-border border-t pt-2.5">
                    <Line
                        label="환불 예정 금액"
                        value={won(preview.refundCash)}
                        tone="strong"
                    />
                </div>
                {preview.usedPoints > 0 && (
                    <Line label="포인트 복원" value={won(preview.usedPoints)} />
                )}
            </div>

            {preview.cancelFee > 0 ? (
                <p className="text-destructive mt-3 flex gap-1.5 text-xs leading-relaxed">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <span>{BRACKET_NOTE[preview.bracket]}</span>
                </p>
            ) : (
                <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
                    {BRACKET_NOTE[preview.bracket]}
                </p>
            )}

            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                {preview.usedPoints > 0
                    ? "사용하신 포인트는 취소수수료와 무관하게 전액 복원됩니다. "
                    : ""}
                환불은 결제하신 수단으로 처리되며, 카드사에 따라 영업일 기준
                3~5일이 걸릴 수 있습니다.
            </p>
        </div>
    );
}
