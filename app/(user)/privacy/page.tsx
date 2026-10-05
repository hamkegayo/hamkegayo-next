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
            <LegalDocumentView doc={PRIVACY} />
            <aside className="mx-auto my-8 max-w-4xl rounded-xl border p-4 text-sm">
                <strong>첫 1시간 무료 이벤트 식별정보 안내</strong>
                <p>
                    인증 이메일 HMAC의 처리 목적·항목·보유 및 파기 기준과 권리
                    행사 방법은{" "}
                    <Link href="/event/opening" className="underline">
                        이벤트 안내
                    </Link>
                    에서 확인할 수 있습니다. 일반 예약은 이벤트 참여 없이도
                    가능합니다.
                </p>
            </aside>
        </>
    );
}
