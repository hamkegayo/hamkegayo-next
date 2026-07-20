import type { Metadata } from "next";

import { getSessionProfile } from "./_lib/profile";
import { MypageSidebar } from "./_components/mypage-sidebar";

export const metadata: Metadata = {
    title: "마이페이지 | 함께가요",
};

export default async function MypageLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // 로그인 가드 (비로그인 시 /login 리다이렉트)
    await getSessionProfile();

    return (
        <div className="mx-auto w-full max-w-6xl px-4 py-10">
            <div className="grid gap-8 md:grid-cols-[220px_1fr]">
                <MypageSidebar />
                <div className="min-w-0">{children}</div>
            </div>
        </div>
    );
}
