import Link from "next/link";

import { CookieSettingsButton } from "@/components/analytics/cookie-settings-button";
import { NonMedicalNotice } from "@/components/non-medical-notice";
import { COMPANY, mailOrderLabel } from "@/lib/legal/company";

/**
 * 사용자 서비스 공통 푸터.
 *
 *  ⚠️ 여기 표시되는 사업자정보는 전자상거래법 제10조 표시사항이다.
 *     값은 `lib/legal/company.ts` 한 곳에서 읽는다 — 약관 부칙과
 *     어긋나면 PG 심사에서 지적된다.
 *
 *  개인정보처리방침은 개인정보보호법 제30조 ②에 따라 다른 링크보다
 *  눈에 띄게 표시해야 하므로 굵게 둔다.
 */

/** 사업자정보 한 항목 — 라벨과 값을 한 덩어리로 묶어 줄바꿈이 어색하지 않게 한다 */
function InfoItem({ label, value }: { label: string; value: string }) {
    return (
        <span className="inline-flex gap-1.5 whitespace-nowrap">
            <span className="text-muted-foreground/70">{label}</span>
            <span>{value}</span>
        </span>
    );
}

export function UserFooter() {
    return (
        <footer className="border-border bg-background text-muted-foreground mt-auto w-full border-t text-sm">
            <div className="mx-auto max-w-6xl px-4 py-8">
                <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <Link
                        href="/faq"
                        className="hover:text-foreground underline-offset-4 hover:underline"
                    >
                        FAQ
                    </Link>
                    <Link
                        href="/terms"
                        className="hover:text-foreground underline-offset-4 hover:underline"
                    >
                        이용약관
                    </Link>
                    <Link
                        href="/privacy"
                        className="text-foreground font-semibold underline-offset-4 hover:underline"
                    >
                        개인정보처리방침
                    </Link>
                    <CookieSettingsButton />
                </nav>

                <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs">
                    <InfoItem label="상호" value={COMPANY.name} />
                    <InfoItem label="대표자" value={COMPANY.ceo} />
                    <InfoItem
                        label="사업자등록번호"
                        value={COMPANY.businessNumber}
                    />
                    <InfoItem
                        label="통신판매업 신고번호"
                        value={mailOrderLabel()}
                    />
                    <InfoItem
                        label="개인정보 보호책임자"
                        value={COMPANY.privacyOfficer}
                    />
                </div>

                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs">
                    <span className="inline-flex gap-1.5">
                        <span className="text-muted-foreground/70">주소</span>
                        <span>{COMPANY.address}</span>
                    </span>
                    <InfoItem label="고객센터" value={COMPANY.tel} />
                    <InfoItem label="운영시간" value={COMPANY.hours} />
                    <span className="inline-flex gap-1.5 whitespace-nowrap">
                        <span className="text-muted-foreground/70">이메일</span>
                        <a
                            href={`mailto:${COMPANY.email}`}
                            className="hover:text-foreground underline-offset-4 hover:underline"
                        >
                            {COMPANY.email}
                        </a>
                    </span>
                </div>

                <div className="mt-6 space-y-1.5">
                    {/* 전자상거래법 제20조 ① · 이용약관 제3조 ② — 중개자 지위 고지 */}
                    <p className="text-xs leading-relaxed">
                        함께가요는 통신판매중개자로서 이용자와 병원동행 파트너를
                        연결하며, 병원동행 서비스 제공계약의 당사자가 아닙니다.
                        서비스 수행에 관한 책임은 해당 파트너에게 있습니다.
                    </p>
                    <NonMedicalNotice />
                </div>

                <p className="text-muted-foreground/70 mt-6 text-xs">
                    © {COMPANY.name}. All rights reserved.
                </p>
            </div>
        </footer>
    );
}
