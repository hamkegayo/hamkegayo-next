"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { kstDateTime } from "@/lib/format";
import type { IdentityCheckView } from "../_lib/identity.server";
import { submitPartnerBirthDate } from "../partner/_actions/identity";

/**
 * 기본 정보의 생년월일 칸 (#226). 목적은 본인확인이며 고객에게 공개하지 않는다.
 * 확인·반려 즉시, 미처리는 30일 뒤 파기되므로 확인 후에는 결과만 보여 준다.
 */
export function BirthDateField({ initial }: { initial: IdentityCheckView }) {
    const [view, setView] = useState(initial);
    const [value, setValue] = useState("");
    const [pending, startTransition] = useTransition();

    if (!view.ok)
        return (
            <p className="text-muted-foreground text-sm">
                본인확인 정보를 불러오지 못했습니다.
            </p>
        );

    if (view.status === "VERIFIED")
        return (
            <p className="text-sm">
                <span className="font-bold text-emerald-600">
                    본인확인 완료
                </span>
                <span className="text-muted-foreground ml-1.5 text-xs">
                    (생년월일은 확인 후 파기했습니다)
                </span>
            </p>
        );

    if (view.status === "PENDING")
        return (
            <p className="text-sm">
                <span className="font-semibold">{view.birthDate}</span>
                <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-500/15">
                    확인 중
                </span>
                {view.purgeAfter && (
                    <span className="text-muted-foreground mt-1 block text-xs">
                        {kstDateTime(view.purgeAfter)}까지 확인되지 않으면 자동
                        파기됩니다.
                    </span>
                )}
            </p>
        );

    if (!view.enabled)
        return (
            <p className="text-muted-foreground text-sm">
                본인확인 접수 준비 중
            </p>
        );

    const submit = () => {
        startTransition(async () => {
            const res = await submitPartnerBirthDate(value);
            if (!res.ok) {
                toast.error(res.message);
                return;
            }
            setView({
                ...view,
                status: "PENDING",
                birthDate: value,
                purgeAfter: new Date(
                    Date.now() + 30 * 86_400_000,
                ).toISOString(),
            });
            toast.success("생년월일을 제출했습니다. 담당자가 확인합니다.");
        });
    };

    return (
        <div>
            {(view.status === "REJECTED" || view.status === "EXPIRED") && (
                <p className="text-destructive mb-1.5 text-xs">
                    {view.status === "REJECTED"
                        ? "본인확인이 반려되었습니다. 다시 제출해 주세요."
                        : "확인 기간이 지나 파기되었습니다. 다시 제출해 주세요."}
                </p>
            )}
            <div className="flex gap-2">
                <input
                    type="date"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    aria-label="생년월일"
                    className="border-input bg-background rounded-lg border px-3 py-2 text-sm"
                />
                <button
                    type="button"
                    onClick={submit}
                    disabled={pending || !value}
                    className="bg-brand text-brand-foreground hover:bg-brand/90 rounded-lg px-4 text-sm font-bold disabled:opacity-50"
                >
                    {pending ? "제출 중…" : "본인확인 제출"}
                </button>
            </div>
            <p className="text-muted-foreground mt-1.5 text-xs break-keep">
                본인확인에만 쓰고 고객에게 공개하지 않습니다. 등록한 면허·자격증
                증빙과 대조한 뒤 바로 파기하며, 30일 안에 확인되지 않아도
                파기합니다.
            </p>
        </div>
    );
}
