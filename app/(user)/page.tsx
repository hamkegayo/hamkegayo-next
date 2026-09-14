import type { Metadata } from "next";

import { HOME_TITLE, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";
import { HomeHero } from "./_components/home/home-hero";
import { ServiceIntro } from "./_components/home/service-intro";
import { Differentiators } from "./_components/home/differentiators";
import { HowToUse } from "./_components/home/how-to-use";
import { Reviews } from "./_components/home/reviews";
import { HomeCta } from "./_components/home/home-cta";

export const metadata: Metadata = {
    title: { absolute: HOME_TITLE },
    description: SITE_DESCRIPTION,
    alternates: { canonical: SITE_URL },
    openGraph: {
        type: "website",
        locale: "ko_KR",
        siteName: SITE_NAME,
        title: HOME_TITLE,
        description: SITE_DESCRIPTION,
        url: SITE_URL,
    },
};

const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: "함께가요",
    url: SITE_URL,
};

export default function HomePage() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(websiteJsonLd).replace(
                        /</g,
                        "\\u003c",
                    ),
                }}
            />
            <HomeHero />
            <ServiceIntro />
            <Differentiators />
            <HowToUse />
            <Reviews />
            <HomeCta />
        </>
    );
}
