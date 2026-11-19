"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { kstDateTime } from "@/lib/format";
import { recordCustomerNotice } from "../../_actions/customer-notice";
import type { CustomerNoticeView } from "../../../_lib/customer-notice.server";

/** 고객에게 확정 안내 문자를 직접 보냈다는 완료 기록. 자동 발송은 없다(#300). */
export function CustomerNoticePanel({
    notice,
}: {
    notice: CustomerNoticeView;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [memo, setMemo] = useState("");
    const [error, setError] = useState("");

    if (notice.doneAt) {
        return (
            <section className="border-border bg-background mb-4 rounded-2xl border p-5">
                <h2 className="text-foreground font-bold">
                    고객 확정 안내 문자
                </h2>
                <p className="mt-1 text-sm font-semibold text-emerald-700">
                    {kstDateTime(notice.doneAt) ?? "-"} 발송 완료로 기록했어요.
                </p>
                {notice.memo && (
                    <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">
                        메모: {notice.memo}
                    </p>
                )}
            </section>
        );
    }
    if (!notice.canRecord) return null;

    return (
        <section className="border-border bg-background mb-4 rounded-2xl border p-5">
            <h2 className="text-foreground font-bold">고객 확정 안내 문자</h2>
            <p className="text-muted-foreground mt-1 text-sm">
                운영팀이 예약을 배정했어요. 고객에게 직접 확정 안내 문자를 보낸
                뒤 아래에 완료를 기록해 주세요. (앱이 문자를 대신 보내지
                않습니다.)
            </p>
            <textarea
                className="border-border mt-3 w-full rounded-lg border p-2 text-sm"
                rows={2}
                maxLength={500}
                placeholder="메모 (선택)"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
            />
            {error && (
                <p
                    role="alert"
                    className="mt-2 text-sm font-semibold text-red-600"
                >
                    {error}
                </p>
            )}
            <button
                type="button"
                disabled={pending}
                className="bg-brand mt-3 cursor-pointer rounded-lg px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() =>
                    start(async () => {
                        const r = await recordCustomerNotice({
                            reservationId: notice.reservationId,
                            memo,
                        });
                        setError(r.ok ? "" : r.message);
                        router.refresh();
                    })
                }
            >
                고객에게 문자 발송 완료
            </button>
        </section>
    );
}
