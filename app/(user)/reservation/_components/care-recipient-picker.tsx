"use client";

import Link from "next/link";
import { Loader2, UserRound } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import type { CareRecipient } from "@/app/(user)/mypage/_lib/care.server";

/**
 * 저장해 둔 환자 정보를 골라 예약 STEP1 에 채우는 모달.
 *
 *  목록이 비어 있는 경우가 정상 상태다 — 처음 예약하는 사용자는 저장된 환자가
 *  없다. 그때 빈 모달을 띄우지 않고 마이페이지로 가는 길을 안내한다.
 */
export function CareRecipientPicker({
    open,
    loading,
    recipients,
    onClose,
    onSelect,
}: {
    open: boolean;
    loading: boolean;
    recipients: CareRecipient[];
    onClose: () => void;
    onSelect: (r: CareRecipient) => void;
}) {
    return (
        <Modal open={open} onClose={onClose} className="max-w-lg">
            <h3 className="text-foreground text-lg font-bold">
                이용자 정보 불러오기
            </h3>
            <p className="text-muted-foreground mt-1.5 text-sm">
                마이페이지에 저장해 둔 환자 정보를 불러옵니다.
            </p>

            {loading ? (
                <div className="text-muted-foreground flex items-center justify-center gap-2 py-12 text-sm">
                    <Loader2 aria-hidden className="size-4 animate-spin" />
                    불러오는 중…
                </div>
            ) : recipients.length === 0 ? (
                <div className="py-10 text-center">
                    <p className="text-foreground text-sm font-semibold">
                        저장된 환자 정보가 없습니다.
                    </p>
                    <p className="text-muted-foreground mt-1.5 text-sm">
                        마이페이지에서 먼저 등록하시면 다음 예약부터 불러올 수
                        있습니다.
                    </p>
                    <Link
                        href="/mypage/profile"
                        className="border-border bg-background text-foreground hover:bg-muted mt-5 inline-block rounded-lg border px-5 py-2.5 text-sm font-bold transition-colors"
                    >
                        환자 정보 관리로 이동
                    </Link>
                </div>
            ) : (
                <ul className="mt-5 max-h-80 space-y-2 overflow-y-auto">
                    {recipients.map((r) => (
                        <li key={r.id}>
                            <button
                                type="button"
                                onClick={() => onSelect(r)}
                                className="border-border hover:border-brand hover:bg-brand/5 flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors"
                            >
                                <span className="bg-brand/10 text-brand flex size-9 shrink-0 items-center justify-center rounded-lg">
                                    <UserRound className="size-4" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-foreground font-bold">
                                        {r.name}
                                        {r.relation && (
                                            <span className="text-muted-foreground ml-1.5 text-sm font-medium">
                                                {r.relation}
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-muted-foreground text-xs">
                                        {[r.genderLabel, r.ageLabel, r.phone]
                                            .filter(Boolean)
                                            .join(" · ")}
                                    </p>
                                </div>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <button
                type="button"
                onClick={onClose}
                className="border-border bg-background text-foreground hover:bg-muted mt-5 w-full rounded-lg border px-4 py-2.5 text-sm font-bold transition-colors"
            >
                닫기
            </button>
        </Modal>
    );
}
