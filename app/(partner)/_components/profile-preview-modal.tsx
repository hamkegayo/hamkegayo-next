"use client";

import { Modal } from "@/components/ui/modal";

function Chips({ items }: { items: string[] }) {
    return (
        <div className="flex flex-wrap gap-2">
            {items.map((t) => (
                <span
                    key={t}
                    className="bg-brand/10 text-brand rounded-full px-3 py-1 text-sm font-semibold"
                >
                    {t}
                </span>
            ))}
        </div>
    );
}

function Section({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            <p className="text-brand text-sm font-bold">{title}</p>
            <div className="mt-2">{children}</div>
        </div>
    );
}

export function ProfilePreviewModal({
    open,
    onClose,
    name,
    roleLine,
    intro,
    regions,
    times,
    preferredHospitals,
}: {
    open: boolean;
    onClose: () => void;
    name: string;
    roleLine: string;
    intro: string;
    regions: string[];
    times: string[];
    preferredHospitals: string[];
}) {
    return (
        <Modal open={open} onClose={onClose} className="max-w-lg p-0">
            {/* 헤더 */}
            <div className="bg-brand text-brand-foreground flex items-center gap-4 rounded-t-2xl px-6 py-5">
                <span className="size-14 shrink-0 rounded-full bg-white/25" />
                <div>
                    <p className="text-xl font-extrabold">{name} 파트너</p>
                    <p className="mt-0.5 text-sm opacity-90">{roleLine}</p>
                </div>
            </div>

            <div className="max-h-[60vh] space-y-5 overflow-y-auto p-6">
                <Section title="자기소개">
                    <p className="text-foreground text-sm leading-relaxed">
                        {intro}
                    </p>
                </Section>
                <Section title="활동 지역">
                    <Chips items={regions} />
                </Section>
                <Section title="활동 가능 시간">
                    <Chips items={times} />
                </Section>
                <Section title="선호 병원">
                    <Chips items={preferredHospitals} />
                </Section>
            </div>

            <div className="p-6 pt-0">
                <button
                    type="button"
                    onClick={onClose}
                    className="bg-brand text-brand-foreground hover:bg-brand/90 w-full rounded-lg px-4 py-3 text-sm font-bold transition-colors"
                >
                    닫기
                </button>
            </div>
        </Modal>
    );
}
