import type { Metadata } from "next";

import { ZoomProvider } from "@/components/providers/zoom-provider";
import { getPartnerName } from "./_lib/partner";
import { PartnerHeader } from "./_components/partner-header";
import { PartnerSidebar } from "./_components/partner-sidebar";

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
            <div className="bg-muted/20 min-h-screen">
                {/* 공유 고정 요소: 헤더(상단) + 사이드바(좌측) */}
                <PartnerHeader name={name} />
                <PartnerSidebar />
                <main className="pt-16 md:pl-56">
                    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
                        {children}
                    </div>
                </main>
            </div>
        </ZoomProvider>
    );
}
