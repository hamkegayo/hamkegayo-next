import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "관리자 | 함께가요",
    // 관리자 화면은 검색엔진에 노출하지 않는다
    robots: { index: false, follow: false },
};

/**
 * 관리자 영역 공통 레이아웃 (#50).
 * 헤더·사이드바 등 실제 관리자 UI 는 #56 에서 붙인다.
 * 로그인 화면도 이 레이아웃을 지나므로 여기서 데이터를 읽지 않는다.
 */
export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="bg-muted/20 min-h-screen">
            <main className="mx-auto max-w-5xl px-4 py-10 md:px-8">
                {children}
            </main>
        </div>
    );
}
