import Image from "next/image";
import type { ReactNode } from "react";

import { Section } from "./section";

/** 두 원본(962×542)을 자르지 않고 같은 높이·본문 기준선으로 표시한다. */
export function PublicHero({
    image,
    alt,
    children,
}: {
    image: string;
    alt: string;
    children: ReactNode;
}) {
    return (
        <Section className="md:py-16">
            <div className="relative isolate overflow-hidden rounded-3xl lg:aspect-[962/542] lg:min-h-[600px]">
                <div className="relative z-10 pb-8 lg:w-[46%] lg:px-6 lg:py-12">
                    {children}
                </div>
                <Image
                    src={image}
                    alt={alt}
                    width={962}
                    height={542}
                    // 원본 PNG를 그대로 제공해 히어로의 추가 손실 압축을 피한다.
                    unoptimized
                    priority
                    className="h-auto w-full lg:absolute lg:inset-0 lg:h-full lg:object-contain"
                />
            </div>
        </Section>
    );
}
