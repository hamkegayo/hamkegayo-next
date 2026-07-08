import type { Metadata } from "next";
import "./globals.css";
import localFont from "next/font/local";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";

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
  description: "병원동행서비스 함께가요", // 메인 페이지용 디폴트 설명
  icons: {
    icon: "/favicon.ico", // public 폴더에 본인 로고 favicon 넣고 주석 해제할 것
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
      </body>
    </html>
  );
}
