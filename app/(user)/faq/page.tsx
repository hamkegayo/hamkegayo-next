import type { Metadata } from "next";

import { FaqHero } from "./_components/faq-hero";
import { ServicePrinciples } from "./_components/service-principles";
import { FaqList } from "./_components/faq-list";
import { FaqContactCta } from "./_components/faq-contact-cta";

export const metadata: Metadata = {
    title: "FAQ | 함께가요",
    description:
        "함께가요 병원 동행 서비스 자주 묻는 질문 — 이용, 요금, 파트너, 안전에 대한 안내.",
};

export default function FaqPage() {
    return (
        <>
            <FaqHero />
            <ServicePrinciples />
            <FaqList />
            <FaqContactCta />
        </>
    );
}
