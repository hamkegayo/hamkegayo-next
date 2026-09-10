import Image from "next/image";

import { Section } from "@/app/(user)/_components/home/section";
import { NonMedicalNotice } from "@/components/non-medical-notice";

/** 서비스 소개 히어로 — 배지 + 헤드라인 + 이미지 */
export function ServiceHero() {
    return (
        <Section className="md:py-16">
            <div className="grid items-center gap-10 md:grid-cols-[1fr_1.2fr] md:gap-14">
                {/* 텍스트 */}
                <div>
                    <span className="bg-brand/10 text-brand inline-block rounded-full px-3 py-1 text-sm font-semibold">
                        서비스 소개
                    </span>
                    <h1 className="text-foreground mt-5 text-3xl leading-snug font-extrabold md:text-4xl md:leading-tight">
                        함께가요는 고객님이
                        <br />
                        신뢰할 수 있는 서비스를
                        <br />
                        제공합니다.
                    </h1>
                    <p className="text-muted-foreground mt-5 leading-relaxed">
                        언제든, 필요한 순간,
                        <br />
                        믿을 수 있는 파트너가 함께합니다.
                    </p>
                    {/*
                      비의료 고지는 히어로 본문의 일부로 둔다. 아래에 테두리
                      박스로 띄워 두면 페이지에서 떨어져 나온 경고문처럼 보인다.
                      메인 히어로도 같은 처리다.
                    */}
                    <NonMedicalNotice className="mt-6 max-w-md" />
                </div>

                {/* 이미지 (교체용 파일: public/user/service-hero.png) */}
                <div className="overflow-hidden rounded-3xl">
                    <Image
                        src="/user/service-hero.png"
                        alt="병원 로비에서 어르신과 함께한 동행 파트너"
                        width={720}
                        height={460}
                        priority
                        className="h-full w-full object-cover"
                    />
                </div>
            </div>
        </Section>
    );
}
