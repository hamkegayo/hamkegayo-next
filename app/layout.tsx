import type { Metadata } from "next";
import "./globals.css";
import { Suspense } from "react";
import localFont from "next/font/local";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { AnalyticsScripts } from "@/components/analytics/analytics-scripts";
import { PageViewTracker } from "@/components/analytics/page-view-tracker";
import { ConsentBanner } from "@/components/analytics/consent-banner";

// 전역 폰트: Pretendard (Variable)
const pretendard = localFont({
    src: "../public/fonts/PretendardVariable.woff2",
    variable: "--font-sans",
    display: "swap",
    weight: "45 920",
});

// 메타데이터 초기화
export const metadata: Metadata = {
    title: {
        template: "%s | 함께가요", // 하위 페이지에서 title을 넣으면 자동으로 치환됨
        default: "함께가요", // 메인 페이지용 디폴트 타이틀
    },
    // 의료 서비스로 오인되지 않도록 "진료·처방" 계열 표현을 쓰지 않는다.
    description: "함께가요 - 병원 방문 이동과 절차를 돕는 동행 지원 서비스", // 메인 페이지용 디폴트 설명
    openGraph: {
        type: "website",
        locale: "ko_KR",
        siteName: "함께가요",
        title: "함께가요",
        description: "함께가요 - 병원 방문 이동과 절차를 돕는 동행 지원 서비스",
        url: "https://www.hamkegayo.kr",
    },
    icons: {
        icon: "/favicon.ico", // public 폴더에 본인 로고 favicon 넣고 주석 해제할 것
    },
    // Meta(페이스북) 도메인 인증
    verification: {
        other: {
            "facebook-domain-verification": "n3yqbvbmchcw7638lspvpe2vtlu2ch",
            "naver-site-verification":
                "484abb8b304c4ee671d6488c562af0f9b71025df",
        },
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        // 다크모드 에러 방지용 suppressHydrationWarning 추가
        <html
            lang="ko"
            suppressHydrationWarning
            className={cn("font-sans", pretendard.variable)}
        >
            {/* 뷰포트 높이 고정 및 안티앨리어싱(폰트 스무딩) 적용 */}
            <body className="min-h-screen bg-white text-slate-900 antialiased">
                {children}
                {/* 알림 컴포넌트 */}
                <Toaster richColors closeButton />
                {/* 애널리틱스 (동의 시에만 로드) + 페이지뷰 추적 + 동의 배너 */}
                <AnalyticsScripts />
                <Suspense fallback={null}>
                    <PageViewTracker />
                </Suspense>
                <ConsentBanner />
            </body>
        </html>
    );
}
