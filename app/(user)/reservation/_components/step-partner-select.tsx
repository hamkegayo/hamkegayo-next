"use client";

import { useState } from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Section } from "@/app/(user)/_components/home/section";
import { useReservationStore } from "../_store/reservation-store";
import { PARTNERS, getPartner, type Partner } from "../_lib/partners";
import { StepBand, StepNav } from "./step-band";

function StatusBadge({ status }: { status: Partner["status"] }) {
    return (
        <span
            className={cn(
                "rounded-md px-2 py-0.5 text-xs font-semibold",
                status === "accepted"
                    ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15"
                    : "bg-amber-100 text-amber-600 dark:bg-amber-500/15",
            )}
        >
            {status === "accepted" ? "수락완료" : "수락대기"}
        </span>
    );
}

function PartnerListCard({
    partner,
    active,
    onSelect,
}: {
    partner: Partner;
    active: boolean;
    onSelect: () => void;
}) {
    return (
        <div
            onClick={onSelect}
            className={cn(
                "cursor-pointer rounded-2xl border-2 p-5 transition-colors",
                active
                    ? "border-brand bg-background"
                    : "bg-muted/30 border-transparent",
            )}
        >
            <div className="flex gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-1.5">
                        <span className="bg-muted text-foreground rounded-md px-2 py-0.5 text-xs font-semibold">
                            {partner.license}
                        </span>
                        <span className="bg-brand/10 text-brand rounded-md px-2 py-0.5 text-xs font-semibold">
                            {partner.recommendType}
                        </span>
                        <StatusBadge status={partner.status} />
                    </div>
                    <p className="text-foreground mt-3 text-lg font-extrabold">
                        {partner.name}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                        {partner.region} {partner.distance} 평점{" "}
                        {partner.rating}
                    </p>
                    <p className="text-muted-foreground mt-2 line-clamp-4 text-sm leading-relaxed">
                        {partner.intro}
                    </p>
                </div>
                <div className="flex w-20 shrink-0 flex-col items-center gap-2">
                    <div className="bg-muted size-16 rounded-full" />
                    <p className="text-foreground text-sm font-bold">
                        <span className="text-amber-500">★</span>{" "}
                        {partner.rating}
                        <span className="text-muted-foreground text-xs font-normal">
                            /5.0
                        </span>
                    </p>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelect();
                        }}
                        className={cn(
                            "rounded-lg px-3 py-1.5 text-xs font-bold transition-colors",
                            active
                                ? "bg-foreground text-background"
                                : "border-border bg-background text-foreground hover:bg-muted border",
                        )}
                    >
                        더보기
                    </button>
                </div>
            </div>
        </div>
    );
}

function ChipRow({ title, items }: { title: string; items: string[] }) {
    return (
        <div>
            <p className="text-foreground text-sm font-bold">{title}</p>
            <div className="mt-3 flex flex-wrap gap-2">
                {items.map((it) => (
                    <span
                        key={it}
                        className="bg-muted text-foreground rounded-lg px-3 py-1.5 text-xs font-medium"
                    >
                        {it}
                    </span>
                ))}
            </div>
        </div>
    );
}

function PartnerDetail({ partner }: { partner: Partner }) {
    return (
        <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
            <div className="bg-muted mx-auto size-24 rounded-full" />
            <p className="text-foreground mt-4 text-center text-xl font-extrabold">
                {partner.name}
            </p>
            <p className="text-foreground mt-1 text-center text-sm font-semibold">
                <span className="text-amber-500">★</span> {partner.rating}{" "}
                <span className="text-muted-foreground font-normal">
                    (후기 {partner.reviewCount}개)
                </span>
            </p>
            <p className="text-muted-foreground mx-auto mt-3 max-w-sm text-center text-sm leading-relaxed">
                {partner.experience}
            </p>

            <div className="mt-6 space-y-5">
                <ChipRow title="추천 사유" items={partner.recommendReasons} />
                <p className="text-muted-foreground text-sm leading-relaxed">
                    {partner.intro}
                </p>
                <div>
                    <p className="text-foreground text-sm font-bold">
                        검증 배지
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {partner.badges.map((b) => (
                            <span
                                key={b}
                                className="border-border bg-background text-foreground rounded-lg border px-3 py-1.5 text-xs font-medium"
                            >
                                {b}
                            </span>
                        ))}
                    </div>
                </div>
                <div>
                    <p className="text-foreground text-sm font-bold">
                        운영 지표
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {partner.metrics.map((m) => (
                            <span
                                key={m.label}
                                className="bg-muted text-foreground rounded-lg px-3 py-1.5 text-xs font-medium"
                            >
                                {m.label} {m.value}
                            </span>
                        ))}
                    </div>
                </div>
                <ChipRow
                    title="사후 리포트 구조"
                    items={partner.reportStructure}
                />
            </div>

            <div className="bg-brand text-brand-foreground mt-6 flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-3 text-sm font-bold">
                선택됨 <Check className="size-4" strokeWidth={3} />
            </div>
        </div>
    );
}

export function StepPartnerSelect() {
    const { data, patch, next, prev } = useReservationStore();
    const [selectedId, setSelectedId] = useState(
        data.partnerId || PARTNERS[0].id,
    );
    const selected = getPartner(selectedId) ?? PARTNERS[0];

    const onNext = () => {
        patch({ partnerId: selectedId });
        next();
    };

    return (
        <>
            <StepBand
                index={6}
                title="원하시는 파트너를 선택해주세요."
                subtitles={[
                    "경력, 자격, 후기, 거리 등을 확인하고",
                    "이용자에게 가장 적합한 파트너를 선택할 수 있습니다.",
                ]}
            />

            <Section>
                <div className="grid gap-6 lg:grid-cols-2">
                    {/* 좌측 목록 */}
                    <div className="space-y-4">
                        {PARTNERS.map((p) => (
                            <PartnerListCard
                                key={p.id}
                                partner={p}
                                active={p.id === selectedId}
                                onSelect={() => setSelectedId(p.id)}
                            />
                        ))}
                    </div>

                    {/* 우측 상세 */}
                    <div className="lg:sticky lg:top-24 lg:self-start">
                        <PartnerDetail partner={selected} />
                    </div>
                </div>

                <StepNav onPrev={prev} nextType="button" onNext={onNext} />
            </Section>
        </>
    );
}
