import type { Metadata } from "next";

import { createClient } from "@/utils/supabase/server";
import { ExtensionPayView } from "./extension-pay-view";
import { COMPANY } from "@/lib/legal/company";

/**
 * 추가결제 링크 페이지 (#75) — 약관 제21조 ⑤.
 *
 *  **비로그인으로 열린다.** 링크는 메일·문자로 전달되고 받는 사람이 예약자
 *  본인이 아닐 수 있다(보호자가 대신 결제하는 경우가 있다).
 *
 *  ⚠️ 그래서 환자 정보를 한 글자도 내리지 않는다. 금액·이용일·예약번호까지다.
 *     조회 RPC(`get_extension_charge`)가 그 범위를 강제한다.
 */

export const metadata: Metadata = {
    title: "추가 결제 | 함께가요",
    // 링크가 검색에 잡히면 안 된다.
    robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Charge = {
    order_id: string;
    amount: number;
    status: string;
    use_date: string;
    code: string;
    expired: boolean;
    charge_reason: string | null;
};

const REASON_LABEL: Record<string, string> = {
    EXTENSION: "이용시간 연장",
    NO_SHOW: "이용자 미도착",
};

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <main className="flex min-h-screen items-center justify-center px-4 py-16">
            <div className="border-border bg-background w-full max-w-md rounded-2xl border p-7 md:p-8">
                {children}
            </div>
        </main>
    );
}

function Notice({ title, body }: { title: string; body: string }) {
    return (
        <Shell>
            <h1 className="text-foreground text-xl font-extrabold">{title}</h1>
            <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                {body}
            </p>
            <p className="text-muted-foreground mt-6 text-xs">
                문의 : 함께가요 고객센터 {COMPANY.tel} ({COMPANY.hours})
            </p>
        </Shell>
    );
}

export default async function ExtensionPayPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const supabase = await createClient();

    const { data } = await supabase.rpc("get_extension_charge", {
        p_token: token,
    });
    const charge = (data as Charge[] | null)?.[0] ?? null;

    if (!charge) {
        return (
            <Notice
                title="결제 정보를 찾을 수 없어요"
                body="링크가 올바르지 않거나 이미 처리된 결제입니다. 링크를 다시 확인해 주세요."
            />
        );
    }

    if (charge.status === "PAID") {
        return (
            <Notice
                title="이미 결제가 완료되었어요"
                body={`예약번호 ${charge.code} 건의 추가 결제가 완료되어 있습니다.`}
            />
        );
    }

    if (charge.expired || charge.status !== "PENDING") {
        return (
            <Notice
                title="결제 기한이 지났어요"
                body="링크가 만료되었습니다. 고객센터로 연락 주시면 다시 안내해 드리겠습니다."
            />
        );
    }

    const clientId = process.env.NEXT_PUBLIC_NICEPAY_CLIENT_KEY ?? "";

    return (
        <Shell>
            <p className="text-muted-foreground text-xs font-semibold">
                함께가요 병원동행
            </p>
            <h1 className="text-foreground mt-1.5 text-xl font-extrabold">
                추가 결제
            </h1>

            <dl className="divide-border border-border mt-6 divide-y border-y">
                <div className="flex justify-between py-3 text-sm">
                    <dt className="text-muted-foreground">예약번호</dt>
                    <dd className="text-foreground font-semibold">
                        {charge.code}
                    </dd>
                </div>
                <div className="flex justify-between py-3 text-sm">
                    <dt className="text-muted-foreground">이용일</dt>
                    <dd className="text-foreground font-semibold">
                        {charge.use_date}
                    </dd>
                </div>
                <div className="flex justify-between py-3 text-sm">
                    <dt className="text-muted-foreground">청구 사유</dt>
                    <dd className="text-foreground font-semibold">
                        {REASON_LABEL[charge.charge_reason ?? ""] ??
                            "추가 이용요금"}
                    </dd>
                </div>
            </dl>

            <div className="bg-brand/5 mt-6 rounded-xl px-4 py-5 text-center">
                <p className="text-muted-foreground text-xs">결제 금액</p>
                <p className="text-brand mt-1 text-3xl font-extrabold">
                    {charge.amount.toLocaleString()}원
                </p>
            </div>

            <ExtensionPayView
                orderId={charge.order_id}
                amount={charge.amount}
                clientId={clientId}
            />

            <p className="text-muted-foreground mt-5 text-xs leading-relaxed">
                카드 정보는 결제사가 직접 처리하며 함께가요는 저장하지 않습니다.
                이 화면에는 이용자 정보가 표시되지 않습니다.
            </p>
        </Shell>
    );
}
