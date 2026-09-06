"use client";

import { useState } from "react";
import Script from "next/script";
import { toast } from "sonner";

import { NICEPAY_SDK_URL } from "@/lib/payments/nicepay";

/**
 * 추가결제 결제창 호출 (#75).
 *
 *  금액과 주문번호는 **서버가 준 값만** 쓴다. 화면이 계산하거나 URL 에서
 *  읽지 않는다 — 승인 라우트가 DB 금액과 다시 대조하므로 어차피 막히지만,
 *  애초에 클라이언트가 금액을 만들 수 있는 경로를 두지 않는다.
 */
declare global {
    interface Window {
        AUTHNICE?: {
            requestPay: (options: Record<string, unknown>) => void;
        };
    }
}

export function ExtensionPayView({
    orderId,
    amount,
    clientId,
}: {
    orderId: string;
    amount: number;
    clientId: string;
}) {
    const [sdkReady, setSdkReady] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const onPay = () => {
        if (submitting || !sdkReady) return;
        setSubmitting(true);

        if (!window.AUTHNICE) {
            toast.error(
                "결제 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.",
            );
            setSubmitting(false);
            return;
        }

        window.AUTHNICE.requestPay({
            clientId,
            method: "card",
            orderId,
            amount,
            // 결제창에 뜨는 이름이다. 환자 정보를 넣지 않는다.
            goodsName: "함께가요 병원동행 추가 결제",
            returnUrl: `${window.location.origin}/api/payments/confirm`,
            fnError: (result: { errorMsg?: string }) => {
                toast.error(result?.errorMsg ?? "결제가 취소되었습니다.");
                setSubmitting(false);
            },
        });
        // 성공하면 결제창으로 이동하므로 로딩을 풀지 않는다.
    };

    return (
        <>
            <Script
                src={NICEPAY_SDK_URL}
                strategy="afterInteractive"
                onReady={() => setSdkReady(true)}
                onError={() => toast.error("결제 모듈을 불러오지 못했습니다.")}
            />

            <button
                type="button"
                onClick={onPay}
                disabled={submitting || !sdkReady || !clientId}
                className="bg-brand text-brand-foreground hover:bg-brand/90 mt-6 w-full rounded-xl px-4 py-3.5 text-sm font-bold transition-colors disabled:opacity-60"
            >
                {submitting ? "결제창을 여는 중…" : "결제하기"}
            </button>

            {!clientId && (
                <p className="text-destructive mt-2.5 text-center text-xs">
                    결제 설정이 완료되지 않았습니다. 고객센터로 문의해 주세요.
                </p>
            )}
        </>
    );
}
