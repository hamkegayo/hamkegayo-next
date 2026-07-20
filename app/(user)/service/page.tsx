import type { Metadata } from "next";

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
            <ServiceHero />
            <ServicePlans />
            <TrustReasons />
            <ServiceFaq />
        </>
    );
}
