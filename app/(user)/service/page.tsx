import type { Metadata } from "next";

import { ServiceViewTracker } from "@/components/analytics/service-view-tracker";
import { NonMedicalNotice } from "@/components/non-medical-notice";
import { ServiceHero } from "./_components/service-hero";
import { ServicePlans } from "./_components/service-plans";
import { TrustReasons } from "./_components/trust-reasons";
import { ServiceFaq } from "./_components/service-faq";

export const metadata: Metadata = {
    title: "서비스 소개 | 함께가요",
    description:
        "함께가요 병원 동행 서비스 소개 — 상황에 맞는 요금제와 안심 포인트를 확인하세요.",
};

export default function ServicePage() {
    return (
        <>
            <ServiceViewTracker />
            <ServiceHero />
            <div className="mx-auto w-full max-w-6xl px-4">
                <NonMedicalNotice className="border-border bg-muted/40 rounded-xl border px-4 py-3" />
            </div>
            <ServicePlans />
            <TrustReasons />
            <ServiceFaq />
        </>
    );
}
