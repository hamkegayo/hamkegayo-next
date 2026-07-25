import type { Metadata } from "next";
import { Suspense } from "react";

import { ZoomProvider } from "@/components/providers/zoom-provider";
import { getPartnerName } from "./_lib/partner";
import { PartnerHeader } from "./_components/partner-header";
import { PartnerSidebar } from "./_components/partner-sidebar";
import { PartnerNavProvider } from "./_components/partner-nav-context";
import { BlockedModal } from "@/components/layout/blocked-modal";

export const metadata: Metadata = {
    title: "파트너 | 함께가요",
};

export default async function PartnerLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const name = await getPartnerName();

    return (
        <ZoomProvider>
            <PartnerNavProvider>
                <div className="bg-muted/20 min-h-screen">
                    <Suspense fallback={null}>
                        <BlockedModal
                            flag="user"
                            title="접근할 수 없는 페이지예요"
                            description={
                                <>
                                    파트너 계정은 사용자 페이지를 이용할 수
                                    없어요.
                                    <br />
                                    파트너 홈으로 이동했어요.
                                </>
                            }
                        />
                    </Suspense>
                    {/* 공유 고정 요소: 헤더(상단) + 사이드바(좌측/모바일 드로워) */}
                    <PartnerHeader name={name} />
                    <PartnerSidebar />
                    <main className="pt-16 md:pl-56">
                        <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
                            {children}
                        </div>
                    </main>
                </div>
            </PartnerNavProvider>
        </ZoomProvider>
    );
}
