import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 로그인 필요 라우트 (역할별). 실제 페이지는 이후 마일스톤에서 추가되며,
// 여기에 프리픽스만 등록하면 미들웨어가 자동으로 가드한다.
const USER_PREFIXES = ["/mypage"];
const PARTNER_PREFIXES = ["/partner"];
const ADMIN_PREFIXES = ["/admin"];
// 관리자 로그인 — /admin 밑이지만 비로그인 상태로 들어와야 한다
const ADMIN_LOGIN = "/admin/login";
// 로그인이 필요한(비로그인 접근 불가) 라우트 — 역할 무관
const LOGIN_REQUIRED = [
    "/mypage",
    "/partner",
    "/reservation",
    "/review/write",
    "/admin",
];
// 로그인 상태에서 접근 시 홈으로 돌려보낼 라우트
const AUTH_PAGES = ["/login", "/signup"];

function matches(pathname: string, prefixes: string[]): boolean {
    return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * 매 요청마다 Supabase 세션을 갱신(쿠키 재설정)하고, 역할 기반 라우트 가드를 적용.
 * @supabase/ssr 패턴에 따라 반드시 getUser() 이후의 response 를 반환해야 한다.
 */
export async function updateSession(request: NextRequest) {
    let response = NextResponse.next({ request });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value),
                    );
                    response = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options),
                    );
                },
            },
        },
    );

    // 중요: createServerClient 와 getUser() 사이에 로직을 넣지 말 것 (세션 꼬임 방지)
    const {
        data: { user },
    } = await supabase.auth.getUser();

    const { pathname } = request.nextUrl;
    const role = user?.app_metadata?.role as
        "USER" | "PARTNER" | "ADMIN" | undefined;
    const isAdminLogin = pathname === ADMIN_LOGIN;

    const redirect = (to: string, search = "") => {
        const url = request.nextUrl.clone();
        url.pathname = to;
        url.search = search;
        return NextResponse.redirect(url);
    };

    // 미로그인 상태로 로그인 필요 라우트 접근 → 홈으로(로그인 안내 모달 표시)
    if (!user && matches(pathname, LOGIN_REQUIRED) && !isAdminLogin) {
        // 관리자 영역은 관리자 로그인으로 보낸다. 홈으로 보내면 운영자가 매번 헤맨다.
        // (로그인 화면 자체는 어차피 공개 경로라 이 분기가 더 드러내는 것은 없다)
        if (matches(pathname, ADMIN_PREFIXES)) return redirect(ADMIN_LOGIN);
        return redirect("/", "?blocked=auth");
    }

    if (user) {
        const PARTNER_HOME = "/partner";
        const ADMIN_HOME = "/admin";

        // 이미 로그인했는데 로그인/회원가입 페이지 접근 → 역할별 홈으로
        if (matches(pathname, AUTH_PAGES)) {
            if (role === "PARTNER") return redirect(PARTNER_HOME);
            if (role === "ADMIN") return redirect(ADMIN_HOME);
            return redirect("/");
        }

        if (role === "ADMIN") {
            // 2단계 인증을 마치기 전에는 관리자 화면 어디에도 들어갈 수 없다.
            // DB 도 is_admin() 에서 aal2 를 요구하므로 여기를 지나도 데이터는 안 보인다.
            const { data: aal } =
                await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
            const verified = aal?.currentLevel === "aal2";

            if (!verified && !isAdminLogin) return redirect(ADMIN_LOGIN);
            if (verified && isAdminLogin) return redirect(ADMIN_HOME);

            // 관리자는 관리자 영역 밖 접근 차단 (관리자 계정으로 예약이 생기지 않도록)
            if (!matches(pathname, ADMIN_PREFIXES)) {
                return redirect(ADMIN_HOME, "?blocked=user");
            }
        } else if (role === "PARTNER") {
            // 파트너는 파트너 영역(/partner) 밖 = 사용자 영역 전체 접근 차단
            if (!matches(pathname, PARTNER_PREFIXES)) {
                return redirect(PARTNER_HOME, "?blocked=user");
            }
        } else {
            // 사용자(또는 역할 미지정)는 파트너·관리자 영역 접근 차단
            if (matches(pathname, PARTNER_PREFIXES)) {
                return redirect("/", "?blocked=partner");
            }
            if (matches(pathname, ADMIN_PREFIXES)) {
                return redirect("/", "?blocked=admin");
            }
            // USER 전용 라우트인데 역할이 USER가 아니면 차단
            if (role !== "USER" && matches(pathname, USER_PREFIXES)) {
                return redirect("/");
            }
        }
    }

    return response;
}
