import type { Metadata } from "next";

import { LegalDocumentView } from "@/components/legal/legal-document";
import { TERMS } from "@/lib/legal/terms";

export const metadata: Metadata = {
    title: "이용약관 | 함께가요",
    description:
        "함께가요 병원동행 서비스 이용약관 — 예약·매칭·선결제, 요금과 취소수수료, 회사의 통신판매중개자 지위를 정합니다.",
};

export default function TermsPage() {
    return <LegalDocumentView doc={TERMS} />;
}
