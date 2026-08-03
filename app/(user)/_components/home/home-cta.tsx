import Link from "next/link";

import { ComingSoonButton } from "./coming-soon-button";
import { Section } from "./section";

export function HomeCta() {
    return (
        <Section>
            <div className="bg-brand/5 rounded-3xl px-6 py-14 text-center">
                <h2 className="text-brand text-2xl font-extrabold md:text-3xl">
                    병원 동행, 함께가요
                </h2>
                <p className="text-muted-foreground mt-3">
                    지금 바로 신청하고 부모님의 병원길을 함께하세요.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                    <Link
                        href="/reservation"
                        className="bg-brand text-brand-foreground hover:bg-brand/90 rounded-lg px-6 py-3 text-sm font-bold transition-colors"
                    >
                        동행 예약하기
                    </Link>
                    <ComingSoonButton
                        contact="phone"
                        className="border-border bg-background text-foreground hover:bg-muted rounded-lg border px-6 py-3 text-sm font-bold transition-colors"
                    >
                        전화 상담 받기
                    </ComingSoonButton>
                </div>
            </div>
        </Section>
    );
}
