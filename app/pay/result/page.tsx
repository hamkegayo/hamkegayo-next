import type { Metadata } from "next";
import { COMPANY } from "@/lib/legal/company";

/**
 * 추가결제 결과 화면 (#75).
 *
 *  결제자가 로그인 상태가 아닐 수 있어 예약 화면으로 돌려보낼 수 없다.
 *  토큰 없이 볼 수 있는 정적 안내만 둔다 — 여기서도 환자 정보는 없다.
 */

export const metadata: Metadata = {
    title: "결제 결과 | 함께가요",
    robots: { index: false, follow: false },
};

const MESSAGE: Record<string, { title: string; body: string }> = {
    done: {
        title: "결제가 완료되었어요",
        body: "추가 결제가 정상적으로 처리되었습니다. 영수증은 카드사에서 확인하실 수 있습니다.",
    },
    expired: {
        title: "결제 기한이 지났어요",
        body: "링크가 만료되었습니다. 고객센터로 연락 주시면 다시 안내해 드리겠습니다.",
    },
    fail: {
        title: "결제를 완료하지 못했어요",
        body: "결제가 처리되지 않았습니다. 카드사 승인이 이루어졌다면 자동으로 취소됩니다. 고객센터로 문의해 주세요.",
    },
};

export default async function PayResultPage({
    searchParams,
}: {
    searchParams: Promise<{ status?: string; code?: string }>;
}) {
    const { status, code } = await searchParams;
    const m = MESSAGE[status ?? ""] ?? MESSAGE.fail;
    const done = status === "done";

    return (
        <main className="flex min-h-screen items-center justify-center px-4 py-16">
            <div className="border-border bg-background w-full max-w-md rounded-2xl border p-7 text-center md:p-8">
                <span
                    aria-hidden
                    className={
                        done
                            ? "bg-brand/10 text-brand mx-auto flex size-14 items-center justify-center rounded-full text-2xl"
                            : "bg-muted text-muted-foreground mx-auto flex size-14 items-center justify-center rounded-full text-2xl"
                    }
                >
                    {done ? "✓" : "!"}
                </span>

                <h1 className="text-foreground mt-5 text-xl font-extrabold">
                    {m.title}
                </h1>
                <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                    {m.body}
                </p>

                {code && (
                    <p className="text-muted-foreground mt-5 text-xs">
                        예약번호{" "}
                        <span className="text-foreground font-semibold">
                            {code}
                        </span>
                    </p>
                )}

                <p className="text-muted-foreground mt-6 text-xs">
                    문의 : 함께가요 고객센터 {COMPANY.tel} ({COMPANY.hours})
                </p>
            </div>
        </main>
    );
}
