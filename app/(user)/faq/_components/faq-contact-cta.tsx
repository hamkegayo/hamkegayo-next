import { ArrowRight, Headset } from "lucide-react";

import { Section } from "@/app/(user)/_components/home/section";
import { ComingSoonButton } from "@/app/(user)/_components/home/coming-soon-button";

/** 하단 고객센터 안내 CTA */
export function FaqContactCta() {
    return (
        <Section>
            <div className="border-border bg-muted/30 flex flex-col items-start justify-between gap-4 rounded-2xl border p-6 md:flex-row md:items-center md:p-8">
                <div className="flex items-center gap-3">
                    <div className="bg-brand/10 text-brand flex size-11 shrink-0 items-center justify-center rounded-xl">
                        <Headset className="size-5" />
                    </div>
                    <div>
                        <p className="text-foreground font-bold">
                            이 외에 궁금한 점이 있으신가요?
                        </p>
                        <p className="text-muted-foreground mt-0.5 text-sm">
                            고객센터를 통해 빠르고 정확하게 안내해 드리겠습니다.
                        </p>
                    </div>
                </div>
                <ComingSoonButton className="border-border bg-background text-foreground hover:bg-muted inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-5 py-3 text-sm font-bold whitespace-nowrap transition-colors md:w-auto">
                    고객센터 바로가기
                    <ArrowRight className="size-4" />
                </ComingSoonButton>
            </div>
        </Section>
    );
}
