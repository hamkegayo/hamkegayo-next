"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmModal } from "@/components/ui/modal";
import { withdrawMember } from "../../_actions/withdraw";

/**
 * 회원 탈퇴 (#72) — 개인정보처리방침 제4조 · 제12조 ③④.
 *
 *  탈퇴하면 무엇이 남는지 **먼저 말한다.** 방침 제12조 ④ 가 "삭제 요청이
 *  있더라도 보존기간 동안 분리하여 보관할 수 있다" 고 공개하고 있으므로,
 *  "모두 삭제됩니다" 라고 적으면 그 자체가 거짓이 된다.
 *
 *  거절될 수 있다는 것도 미리 알린다. 눌렀다가 막히는 것보다, 왜 막히는지
 *  알고 정리한 뒤 누르는 편이 낫다.
 */

const REASONS = [
    "서비스를 이용할 일이 없어졌어요",
    "이용 방법이 불편해요",
    "가격이 부담돼요",
    "원하는 지역·시간에 파트너가 없어요",
    "다른 서비스를 이용하려고 해요",
] as const;

export function WithdrawSection() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState<string>("");
    const [pending, startTransition] = useTransition();

    const onWithdraw = () => {
        startTransition(async () => {
            const res = await withdrawMember(reason);
            if (res.ok) {
                setOpen(false);
                toast.success("탈퇴가 완료되었습니다. 그동안 감사했습니다.");
                // 세션이 이미 끊겼다. replace 로 뒤로가기에 남기지 않는다.
                router.replace("/");
                router.refresh();
            } else {
                // 모달은 열어 둔다 — 사유를 읽고 정리한 뒤 다시 시도할 수 있다.
                toast.error(res.message);
            }
        });
    };

    return (
        <div className="border-border bg-background rounded-2xl border p-6 md:p-7">
            <h2 className="text-foreground text-lg font-bold">회원 탈퇴</h2>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                탈퇴하시면 함께가요 서비스를 더 이상 이용하실 수 없습니다.
                이름·연락처 등 회원 정보는 즉시 분리 보관으로 전환되어 접근이
                차단됩니다.
            </p>

            <div className="mt-5 flex justify-end">
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    disabled={pending}
                    className="text-muted-foreground hover:text-destructive hover:border-destructive/40 border-border rounded-lg border px-5 py-2.5 text-sm font-bold transition-colors disabled:opacity-60"
                >
                    탈퇴하기
                </button>
            </div>

            <ConfirmModal
                open={open}
                onClose={() => setOpen(false)}
                onConfirm={onWithdraw}
                title="정말 탈퇴하시겠어요?"
                cancelLabel="돌아가기"
                confirmLabel="탈퇴하기"
                tone="destructive"
                confirmDisabled={pending}
            >
                <div className="mt-4 text-left">
                    <div className="border-border rounded-xl border px-4 py-4">
                        <p className="text-foreground text-sm font-bold">
                            탈퇴 후에도 남는 정보가 있습니다
                        </p>
                        <ul className="text-muted-foreground mt-2.5 space-y-1.5 text-xs leading-relaxed">
                            <li>
                                · 결제·환불·정산 기록 —{" "}
                                <span className="text-foreground font-semibold">
                                    5년
                                </span>{" "}
                                (관계 법령)
                            </li>
                            <li>
                                · 서비스 수행기록·리포트 —{" "}
                                <span className="text-foreground font-semibold">
                                    5년
                                </span>
                            </li>
                            <li>
                                · 분쟁 대응을 위한 최소 식별정보 —{" "}
                                <span className="text-foreground font-semibold">
                                    3년
                                </span>{" "}
                                (분리 보관)
                            </li>
                        </ul>
                        <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
                            보관 기간이 지나면 자동으로 파기됩니다. 자세한
                            내용은{" "}
                            <a
                                href="/privacy"
                                target="_blank"
                                rel="noreferrer"
                                className="text-foreground font-semibold underline underline-offset-4"
                            >
                                개인정보처리방침
                            </a>{" "}
                            제4조를 확인해 주세요.
                        </p>
                    </div>

                    <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
                        미결제 금액, 진행 예정인 예약, 지급되지 않은 정산금이
                        있으면 탈퇴가 제한됩니다.
                    </p>

                    <label
                        htmlFor="withdraw-reason"
                        className="text-foreground mt-5 block text-sm font-bold"
                    >
                        떠나시는 이유를 알려주시겠어요?{" "}
                        <span className="text-muted-foreground font-normal">
                            (선택)
                        </span>
                    </label>
                    <select
                        id="withdraw-reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="border-border bg-background text-foreground mt-2 w-full rounded-lg border px-3 py-2.5 text-sm"
                    >
                        <option value="">선택하지 않음</option>
                        {REASONS.map((r) => (
                            <option key={r} value={r}>
                                {r}
                            </option>
                        ))}
                    </select>
                </div>
            </ConfirmModal>
        </div>
    );
}
