import { ZoomProvider } from "@/components/providers/zoom-provider";
import { UserHeader } from "@/components/layout/user-header";
import { UserFooter } from "@/components/layout/user-footer";

/**
 * 사용자 서비스 공통 레이아웃 (헤더 / 푸터).
 * 파트너 서비스는 별도 레이아웃을 사용한다.
 */
export default function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ZoomProvider>
      <div className="flex min-h-screen flex-col">
        <UserHeader />
        <main className="flex flex-1 flex-col">{children}</main>
        <UserFooter />
      </div>
    </ZoomProvider>
  );
}
