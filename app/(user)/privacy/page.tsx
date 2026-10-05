import type { Metadata } from "next";
import Link from "next/link";

import { LegalDocumentView } from "@/components/legal/legal-document";
import { PRIVACY } from "@/lib/legal/privacy";

export const metadata: Metadata = {
    title: "개인정보처리방침",
    description:
        "함께가요가 처리하는 개인정보의 항목과 목적, 파트너에 대한 단계별 제공 범위, 보유기간과 정보주체의 권리를 안내합니다.",
};

export default function PrivacyPage() {
    return (
        <>
            <aside className="mx-auto mt-8 max-w-4xl rounded-xl border p-4 text-sm leading-relaxed">
                <strong>후기 공개 안내</strong>
                <p>
                    실제 이용자의 별도 공개 동의와 증빙 확인 절차를 준비
                    중입니다. 구체적인 진료·검사 정보는 공개하지 않습니다. 동의
                    주체·허용 항목·공개 범위, 동의일부터 3년의 공개 기간 및 철회
                    방법은{" "}
                    <Link
                        href="/review/publication-consent"
                        className="underline"
                    >
                        후기 공개 동의 안내
                    </Link>
                    에서 확인할 수 있습니다. 방침 정본 개정과 확인 절차가 완료된
                    후 공개를 시작합니다.
                </p>
            </aside>
            <aside className="mx-auto my-8 max-w-4xl rounded-xl border p-4 text-sm">
                <strong>파트너 자격·경력 증빙 수집 안내</strong>
                <p>
                    증빙 원본의 심사 결과 통지 후 30일 보유·이의신청·파기 및
                    수집 항목은{" "}
                    <Link href="/partner-evidence-notice" className="underline">
                        파트너 증빙 안내
                    </Link>
                    에서 확인할 수 있습니다.
                </p>
            </aside>
            <LegalDocumentView doc={PRIVACY} />
        </>
    );
}
