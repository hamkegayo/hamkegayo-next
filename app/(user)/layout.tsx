import { ZoomProvider } from "@/components/providers/zoom-provider";
import { UserHeader, type HeaderMember } from "@/components/layout/user-header";
import { UserFooter } from "@/components/layout/user-footer";
import { createClient } from "@/utils/supabase/server";

/**
 * 사용자 서비스 공통 레이아웃 (헤더 / 푸터).
 * 파트너 서비스는 별도 레이아웃을 사용한다.
 */
export default async function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 로그인 시에만 회원 정보를 구성 (헤더 회원메뉴 표시용)
  let member: HeaderMember = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, role")
      .eq("id", user.id)
      .maybeSingle();

    let subText = user.email ?? "";
    // 파트너는 합성 이메일 대신 발급 아이디를 표시
    if (profile?.role === "PARTNER") {
      const { data: pa } = await supabase
        .from("partner_accounts")
        .select("login_id")
        .eq("profile_id", user.id)
        .maybeSingle();
      if (pa?.login_id) subText = `아이디: ${pa.login_id}`;
    }

    member = { name: profile?.name ?? "회원", subText };
  }

  return (
    <ZoomProvider>
      <div className="flex min-h-screen flex-col">
        <UserHeader member={member} />
        <main className="flex flex-1 flex-col">{children}</main>
        <UserFooter />
      </div>
    </ZoomProvider>
  );
}
