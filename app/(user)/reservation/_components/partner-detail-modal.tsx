"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Avatar } from "@/components/ui/avatar";
import { kstDateTime } from "@/lib/format";
import type { PartnerDetail } from "@/lib/partner-details";
import { getReservationPartnerDetail } from "../_actions/matching";

export function PartnerDetailModal({
    reservationId,
    partnerId,
    onClose,
}: {
    reservationId: string;
    partnerId: string;
    onClose: () => void;
}) {
    const titleId = useId();
    const panel = useRef<HTMLDivElement>(null);
    const [detail, setDetail] = useState<PartnerDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [retry, setRetry] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        getReservationPartnerDetail(reservationId, partnerId)
            .then((result) => {
                if (!active) return;
                if (result.ok) setDetail(result.detail);
                else setError(result.message);
                setLoading(false);
            })
            .catch(() => {
                if (!active) return;
                setError("정보를 불러오지 못했습니다. 다시 시도해 주세요.");
                setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [reservationId, partnerId, retry]);

    useEffect(() => {
        const trigger = document.activeElement as HTMLElement | null;
        const dialog = panel.current?.closest('[role="dialog"]');
        dialog?.setAttribute("aria-labelledby", titleId);
        panel.current?.focus();
        const trap = (event: KeyboardEvent) => {
            if (event.key !== "Tab" || !dialog) return;
            const elements = Array.from(
                dialog.querySelectorAll<HTMLElement>(
                    'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
                ),
            );
            const first = elements[0];
            const last = elements.at(-1);
            if (!first || !last) {
                event.preventDefault();
                return;
            }
            if (
                event.shiftKey &&
                (document.activeElement === first ||
                    document.activeElement === panel.current)
            ) {
                event.preventDefault();
                last.focus();
            } else if (
                !event.shiftKey &&
                (document.activeElement === last ||
                    !dialog.contains(document.activeElement))
            ) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener("keydown", trap);
        return () => {
            document.removeEventListener("keydown", trap);
            if (trigger?.isConnected) trigger.focus();
        };
    }, [titleId]);

    return (
        <Modal open onClose={onClose} className="max-w-2xl">
            <div ref={panel} tabIndex={-1} className="outline-none">
                <div className="flex items-center justify-between gap-3">
                    <h2 id={titleId} className="text-xl font-bold">
                        파트너 상세 정보
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="상세 정보 닫기"
                        className="hover:bg-muted rounded-lg p-2"
                    >
                        <X className="size-5" />
                    </button>
                </div>
                <div
                    className="mt-5 max-h-[65vh] space-y-6 overflow-y-auto pr-1"
                    aria-busy={loading}
                >
                    {loading && <p role="status">정보를 불러오는 중입니다.</p>}
                    {error && (
                        <div role="alert">
                            <p>{error}</p>
                            <button
                                type="button"
                                className="text-brand mt-3 underline"
                                onClick={() => {
                                    setLoading(true);
                                    setError(null);
                                    setDetail(null);
                                    setRetry((value) => value + 1);
                                }}
                            >
                                다시 시도
                            </button>
                        </div>
                    )}
                    {detail && (
                        <>
                            <div className="flex items-center gap-4">
                                <Avatar
                                    src={detail.avatarUrl}
                                    alt={`${detail.name} 파트너 프로필 사진`}
                                    className="bg-muted size-16"
                                />
                                <div>
                                    <h3 className="text-lg font-bold">
                                        {detail.name}
                                    </h3>
                                    <p className="text-muted-foreground text-sm">
                                        {detail.rating === null
                                            ? "후기 없음"
                                            : `★ ${detail.rating.toFixed(1)} · 후기 ${detail.reviewCount}개`}
                                    </p>
                                </div>
                            </div>
                            {!detail.publicConsent && (
                                <p className="text-muted-foreground text-sm">
                                    파트너가 상세 프로필 공개에 동의하지 않아
                                    추가 정보를 표시하지 않습니다.
                                </p>
                            )}
                            <DetailSection title="자기소개">
                                <p className="text-sm break-words whitespace-pre-wrap">
                                    {detail.intro || "등록된 정보 없음"}
                                </p>
                            </DetailSection>
                            <DetailSection title="검증된 근무 경력">
                                {detail.workHistory.length === 0 ? (
                                    <p className="text-muted-foreground text-sm">
                                        등록된 정보 없음
                                    </p>
                                ) : (
                                    <ul className="space-y-3">
                                        {detail.workHistory.map((history) => (
                                            <li
                                                key={history.id}
                                                className="rounded-xl border p-4"
                                            >
                                                <p className="font-bold">
                                                    {history.hospital}{" "}
                                                    <span className="text-brand text-xs">
                                                        관리자 검증 완료
                                                    </span>
                                                </p>
                                                <p className="mt-1 text-sm">
                                                    {history.period} ·{" "}
                                                    {history.department}
                                                </p>
                                                <p className="mt-2 text-sm break-words whitespace-pre-wrap">
                                                    {history.duties}
                                                </p>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </DetailSection>
                            <DetailSection title="검증된 자격">
                                <ul className="space-y-2 text-sm">
                                    {detail.qualifications.length === 0 ? (
                                        <li className="text-muted-foreground">
                                            등록된 정보 없음
                                        </li>
                                    ) : (
                                        detail.qualifications.map(
                                            (qualification, index) => (
                                                <li key={index}>
                                                    {qualification.type}
                                                    {qualification.issuer
                                                        ? ` · ${qualification.issuer}`
                                                        : ""}{" "}
                                                    <span className="text-brand">
                                                        인증 완료
                                                    </span>
                                                </li>
                                            ),
                                        )
                                    )}
                                </ul>
                            </DetailSection>
                            <DetailSection title="공개 후기">
                                <p className="text-muted-foreground mb-3 text-xs">
                                    최근 후기 최대 10개
                                </p>
                                {detail.reviews.length === 0 ? (
                                    <p className="text-muted-foreground text-sm">
                                        후기 없음
                                    </p>
                                ) : (
                                    <ul className="space-y-3">
                                        {detail.reviews.map((review) => (
                                            <li
                                                key={review.id}
                                                className="rounded-xl border p-4"
                                            >
                                                <p className="font-bold">
                                                    {review.title}
                                                </p>
                                                <p className="text-muted-foreground mt-1 text-xs">
                                                    {review.author} · ★{" "}
                                                    {review.rating} ·{" "}
                                                    {kstDateTime(
                                                        review.createdAt,
                                                    )}
                                                </p>
                                                <p className="mt-2 text-sm break-words whitespace-pre-wrap">
                                                    {review.content}
                                                </p>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </DetailSection>
                        </>
                    )}
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="bg-brand text-brand-foreground mt-6 w-full rounded-lg px-4 py-3 font-bold"
                >
                    닫기
                </button>
            </div>
        </Modal>
    );
}

function DetailSection({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section>
            <h3 className="mb-2 font-bold">{title}</h3>
            {children}
        </section>
    );
}
