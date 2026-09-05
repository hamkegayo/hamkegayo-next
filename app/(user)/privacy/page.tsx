import type { Metadata } from "next";

import { LegalDocumentView } from "@/components/legal/legal-document";
import { PRIVACY } from "@/lib/legal/privacy";

export const metadata: Metadata = {
    title: "개인정보처리방침 | 함께가요",
    description:
        "함께가요가 처리하는 개인정보의 항목과 목적, 파트너에 대한 단계별 제공 범위, 보유기간과 정보주체의 권리를 안내합니다.",
};

export default function PrivacyPage() {
    return <LegalDocumentView doc={PRIVACY} />;
}
