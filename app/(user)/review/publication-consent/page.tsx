import type { Metadata } from "next";
import Link from "next/link";

import { COMPANY } from "@/lib/legal/company";
import { REVIEW_PUBLICATION } from "@/lib/legal/review-publication";

export const metadata: Metadata = {
    title: "후기 공개 동의 안내",
    robots: { index: false, follow: false },
};

/** 확인 절차 승인 전 전자동의를 받지 않는다. 기존 서비스 동의를 재사용하지 않는다. */
export default function ReviewPublicationConsentPage() {
    const sections = [
        ["공개 목적", REVIEW_PUBLICATION.purpose],
        ["동의 주체", REVIEW_PUBLICATION.subject],
        ["공개 항목", REVIEW_PUBLICATION.items],
        ["공개 범위", REVIEW_PUBLICATION.scope],
        ["공개 기간", REVIEW_PUBLICATION.period],
        ["철회 방법", REVIEW_PUBLICATION.withdrawal],
        ["동의 거부 권리", REVIEW_PUBLICATION.optional],
    ];
    return (
        <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
            <h1 className="text-2xl font-bold">후기 공개 동의 안내</h1>
            <p className="rounded-xl border p-4 text-sm leading-relaxed">
                실제 이용자의 공개 동의와 증빙 확인 절차를 준비하고 있습니다.
                현재 이 화면에서는 동의를 받지 않으며, 진료·검사 정보는 공개하지
                않습니다.
            </p>
            {sections.map(([title, text]) => (
                <section key={title} className="space-y-2">
                    <h2 className="font-bold">{title}</h2>
                    <p className="text-description-foreground text-sm leading-relaxed">
                        {text}
                    </p>
                </section>
            ))}
            <p className="text-sm">
                담당자: {COMPANY.privacyOfficer} ·{" "}
                <a className="underline" href={`mailto:${COMPANY.email}`}>
                    {COMPANY.email}
                </a>
                {" · "}
                <a className="underline" href={COMPANY.kakaoUrl}>
                    카카오톡 문의
                </a>
            </p>
            <p className="text-muted-foreground text-xs">
                문구 버전: {REVIEW_PUBLICATION.version}
            </p>
            <Link href="/review" className="inline-block underline">
                후기 목록으로
            </Link>
        </main>
    );
}
