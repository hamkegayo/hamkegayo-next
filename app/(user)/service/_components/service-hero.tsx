import { PublicHero } from "@/app/(user)/_components/home/public-hero";
import { NonMedicalNotice } from "@/components/non-medical-notice";
import { SERVICE_HOURS_LABEL } from "@/lib/service-hours";

/** 서비스 소개 히어로 — 배지 + 헤드라인 + 이미지 */
export function ServiceHero() {
    return (
        <PublicHero
            image="/user/service-hero.png"
            alt="동행 파트너의 도움을 받아 병원 접수를 진행하는 어르신"
        >
            {/* 텍스트 */}
            <div>
                <span className="bg-brand/10 text-brand inline-block rounded-full px-3 py-1 text-sm font-semibold">
                    서비스 소개
                </span>
                <h1 className="text-foreground mt-5 text-3xl leading-snug font-extrabold break-keep md:text-4xl md:leading-tight">
                    <span className="text-brand">함께가요</span>는 고객님이
                    <br />
                    신뢰할 수 있는 서비스를
                    <br />
                    제공합니다.
                </h1>
                <p className="text-description-foreground mt-5 leading-relaxed">
                    언제든, 필요한 순간,
                    <br />
                    믿을 수 있는 파트너가 함께합니다.
                </p>
                {/*
                      비의료 고지는 히어로 본문의 일부로 둔다. 아래에 테두리
                      박스로 띄워 두면 페이지에서 떨어져 나온 경고문처럼 보인다.
                      메인 히어로도 같은 처리다.
                    */}
                <p className="text-description-foreground mt-5 text-sm leading-relaxed">
                    서비스 제공시간: {SERVICE_HOURS_LABEL}
                </p>
                <NonMedicalNotice className="mt-6 max-w-md" />
            </div>
        </PublicHero>
    );
}
