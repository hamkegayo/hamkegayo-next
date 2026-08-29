"use client";

import { useEffect, useState, useTransition } from "react";
import { Clock, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Section } from "@/app/(user)/_components/home/section";
import { ConfirmModal } from "@/components/ui/modal";
import { Avatar } from "@/components/ui/avatar";
import { confirmPartner } from "@/app/(user)/mypage/_actions/matching";
import { useReservationStore } from "../_store/reservation-store";
import {
    getReservationApplicantsDetailed,
    type DetailedApplicant,
} from "../_actions/matching";
import { StepBand } from "./step-band";

const POLL_MS = 5000;

export function StepPartnerSelect() {
    const { data, patch, next, prev } = useReservationStore();
    const reservationId = data.reservationId;

    const [applicants, setApplicants] = useState<DetailedApplicant[]>([]);
    const [selected, setSelected] = useState<DetailedApplicant | null>(null);
    const [pending, startTransition] = useTransition();

    useEffect(() => {
        if (!reservationId) return;
        let active = true;
        const run = async () => {
            const list = await getReservationApplicantsDetailed(reservationId);
            if (active) setApplicants(list);
        };
        run();
        const id = setInterval(() => {
            if (document.visibilityState === "visible") run();
        }, POLL_MS);
        return () => {
            active = false;
            clearInterval(id);
        };
    }, [reservationId]);

    const onConfirm = () => {
        if (!selected || !reservationId) return;
        const partner = selected;
        startTransition(async () => {
            const res = await confirmPartner(reservationId, partner.partnerId);
            setSelected(null);
            if (res.ok) {
                patch({
                    partnerId: partner.partnerId,
                    confirmedPartnerName: partner.name,
                });
                toast.success("파트너를 확정했습니다.");
                next();
            } else {
                toast.error(res.message);
            }
        });
    };

    return (
        <>
            <StepBand
                index={6}
                title="원하시는 파트너를 선택해주세요."
                subtitles={[
                    "수락한 파트너의 평점과 자격을 확인하고",
                    "이용자에게 가장 적합한 파트너를 선택할 수 있습니다.",
                ]}
            />

            <Section>
                <div className="mx-auto max-w-3xl">
                    <h3 className="text-foreground text-lg font-bold">
                        수락한 파트너
                        <span className="text-brand ml-2">
                            {applicants.length}
                        </span>
                    </h3>
                    <p className="text-muted-foreground mt-1 text-sm">
                        한 분을 선택하면 예약이 확정되고, 다른 지원 파트너는
                        자동으로 마감됩니다.
                    </p>

                    {applicants.length === 0 ? (
                        <div className="border-border bg-background mt-6 flex flex-col items-center gap-3 rounded-2xl border px-6 py-16 text-center">
                            <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
                                <UserRound className="size-6" />
                            </span>
                            <p className="text-foreground font-bold">
                                아직 수락한 파트너가 없어요
                            </p>
                            <p className="text-muted-foreground text-sm">
                                파트너가 요청을 수락하면 여기에 표시됩니다.
                            </p>
                        </div>
                    ) : (
                        <ul className="mt-6 space-y-3">
                            {applicants.map((a) => (
                                <li
                                    key={a.partnerId}
                                    className="border-border bg-background flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center"
                                >
                                    <Avatar
                                        src={a.avatarUrl}
                                        alt={`${a.name} 파트너 프로필 사진`}
                                        className="bg-muted size-14"
                                        iconClassName="text-muted-foreground"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-foreground flex items-center gap-2 text-lg font-extrabold">
                                            {a.name}
                                            {a.rating !== null ? (
                                                <span className="text-muted-foreground text-sm font-semibold">
                                                    <span className="text-amber-500">
                                                        ★
                                                    </span>{" "}
                                                    {a.rating.toFixed(1)} (후기{" "}
                                                    {a.reviewCount})
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground text-xs font-medium">
                                                    후기 없음
                                                </span>
                                            )}
                                        </p>
                                        {a.qualifications.length > 0 && (
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {a.qualifications.map(
                                                    (q, i) => (
                                                        <span
                                                            key={`${a.partnerId}-${i}`}
                                                            className="bg-brand/10 text-brand inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold"
                                                        >
                                                            <ShieldCheck className="size-3" />
                                                            {q.type}
                                                            {q.issuer
                                                                ? ` · ${q.issuer}`
                                                                : ""}
                                                        </span>
                                                    ),
                                                )}
                                            </div>
                                        )}
                                        <p className="text-muted-foreground mt-2 flex items-center gap-1 text-xs">
                                            <Clock className="size-3.5" />
                                            {a.appliedAtLabel} 수락
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSelected(a)}
                                        disabled={pending}
                                        className="bg-brand text-brand-foreground hover:bg-brand/90 shrink-0 rounded-lg px-5 py-2.5 text-sm font-bold transition-colors disabled:opacity-60"
                                    >
                                        이 파트너로 선택
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="flex justify-center pt-6">
                        <button
                            type="button"
                            onClick={prev}
                            className="border-border bg-background text-foreground hover:bg-muted rounded-lg border px-6 py-3 text-sm font-bold transition-colors"
                        >
                            이전
                        </button>
                    </div>
                </div>
            </Section>

            <ConfirmModal
                open={selected !== null}
                onClose={() => setSelected(null)}
                onConfirm={onConfirm}
                title="이 파트너로 확정할까요?"
                cancelLabel="돌아가기"
                confirmLabel="파트너 확정"
                confirmDisabled={pending}
            >
                <p className="text-muted-foreground mt-3 text-left text-sm leading-relaxed">
                    <span className="text-foreground font-bold">
                        {selected?.name}
                    </span>{" "}
                    님으로 예약이 확정되며, 다른 지원 파트너는 자동으로
                    마감됩니다. 확정 후에는 변경할 수 없습니다.
                </p>
            </ConfirmModal>
        </>
    );
}
