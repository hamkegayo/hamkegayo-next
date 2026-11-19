"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
    normalizeWithdrawalReason,
    WITHDRAWAL_REASON_MAX,
} from "@/lib/auth/admin-withdrawal";

import { withdrawMemberByAdmin } from "./actions";

/**
 * 운영자 탈퇴 처리 폼 (#293). /admin/withdrawals 와 /admin/social-unlinks 가 함께 쓴다.
 * 고객문의 채널로 회원 본인의 탈퇴 의사를 확인한 경우에만 처리한다(개인정보처리방침 제12조 ③).
 * 처리 근거는 접속기록과 분리 보관 사유에 남으므로 개인정보를 적지 않게 안내한다.
 */
export function AdminWithdrawForm({
    userId,
    socialUnlinkId = null,
    onDone,
}: {
    userId: string;
    socialUnlinkId?: string | null;
    onDone?: () => void;
}) {
    const router = useRouter();
    const id = useId();
    const [reason, setReason] = useState("");
    const [confirmedIntent, setConfirmedIntent] = useState(false);
    const [step, setStep] = useState<"edit" | "confirm">("edit");
    const [pending, startTransition] = useTransition();

    const valid = normalizeWithdrawalReason(reason).ok && confirmedIntent;

    const submit = () =>
        startTransition(async () => {
            const result = await withdrawMemberByAdmin({
                userId,
                reason,
                confirmed: confirmedIntent,
                socialUnlinkId,
            });
            if (!result.ok) {
                toast.error(result.message);
                setStep("edit");
                return;
            }
            if (result.authLockWarning) toast.warning(result.message);
            else toast.success(result.message);
            setReason("");
            setConfirmedIntent(false);
            setStep("edit");
            router.refresh();
            onDone?.();
        });

    return (
        <div className="mt-4 space-y-3">
            <label
                className="block text-sm font-semibold"
                htmlFor={`${id}-reason`}
            >
                처리 근거 (5-{WITHDRAWAL_REASON_MAX}자)
            </label>
            <p className="text-description-foreground text-xs leading-relaxed break-keep">
                고객문의 채널로 확인한 탈퇴 의사와 확인 경로(이메일·카카오톡 등,
                확인 일시)를 적어 주세요. 접속기록과 분리 보관 기록에 남으므로
                연락처·이름 등 개인정보는 적지 마세요.
            </p>
            <textarea
                id={`${id}-reason`}
                value={reason}
                onChange={(event) => {
                    setReason(event.target.value);
                    setStep("edit");
                }}
                maxLength={WITHDRAWAL_REASON_MAX}
                disabled={pending}
                placeholder="예) 11/19 카카오톡 고객문의로 본인 탈퇴 의사 확인, 카카오계정 탈퇴로 로그인 불가"
                className="bg-background w-full rounded-lg border p-3 text-sm"
            />
            <label className="flex items-start gap-2 text-sm leading-relaxed break-keep">
                <input
                    type="checkbox"
                    checked={confirmedIntent}
                    onChange={(event) => {
                        setConfirmedIntent(event.target.checked);
                        setStep("edit");
                    }}
                    disabled={pending}
                    className="mt-1 size-4"
                />
                <span>
                    고객문의 채널을 통해 회원 본인의 탈퇴 의사를
                    확인했습니다(의사 확인 없는 탈퇴 불가).
                </span>
            </label>

            {step === "edit" ? (
                <button
                    type="button"
                    disabled={!valid || pending}
                    onClick={() => setStep("confirm")}
                    className="rounded-lg bg-red-600 px-4 py-2 font-bold text-white disabled:opacity-50"
                >
                    운영자 탈퇴 처리
                </button>
            ) : (
                <div
                    role="alertdialog"
                    aria-labelledby={`${id}-confirm`}
                    className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-4 dark:bg-red-950/30"
                >
                    <p
                        id={`${id}-confirm`}
                        className="text-sm leading-relaxed font-semibold break-keep"
                    >
                        이 회원을 탈퇴 처리할까요? 되돌릴 수 없습니다.
                        이름·연락처·이메일은 분리 보관(3년)으로 옮겨지고, 소셜
                        로그인 연결과 로그인 수단이 해제됩니다.
                        {socialUnlinkId
                            ? " 연결 해제 기록도 함께 파기됩니다."
                            : ""}
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            disabled={pending}
                            onClick={submit}
                            className="rounded-lg bg-red-600 px-4 py-2 font-bold text-white disabled:opacity-50"
                        >
                            {pending ? "처리 중…" : "탈퇴 최종 확인"}
                        </button>
                        <button
                            type="button"
                            disabled={pending}
                            onClick={() => setStep("edit")}
                            className="bg-background rounded-lg border px-4 py-2 font-semibold disabled:opacity-50"
                        >
                            취소
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
