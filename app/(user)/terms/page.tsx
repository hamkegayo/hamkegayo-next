import type { Metadata } from "next";

import { LegalDocumentView } from "@/components/legal/legal-document";
import { TERMS } from "@/lib/legal/terms";

export const metadata: Metadata = {
    title: "이용약관",
    description:
        "함께가요 병원동행 서비스 이용약관 — 예약·매칭·선결제, 요금과 취소수수료, 회사의 통신판매중개자 지위를 정합니다.",
};

export default function TermsPage() {
    return (
        <>
            <aside
                className="bg-muted mx-auto mt-8 max-w-4xl rounded-xl p-6"
                aria-label="현재 적용 요금 안내"
            >
                <h2 className="font-bold">주말·공휴일 할증 면제 안내</h2>
                <p className="mt-2">
                    신규 예약은 별도 고지 전까지 토요일·일요일·공휴일·대체공휴일
                    할증률 0%를 적용합니다. 연장 요금에도 같은 기준을
                    적용합니다. 기존 예약은 예약 당시 저장된 금액과 할증률을
                    유지합니다.
                </p>
            </aside>
            <LegalDocumentView doc={TERMS} />
        </>
    );
}
