import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 로그인 필요 라우트 (역할별). 실제 페이지는 이후 마일스톤에서 추가되며,
// 여기에 프리픽스만 등록하면 미들웨어가 자동으로 가드한다.
const USER_PREFIXES = ["/mypage"];
const PARTNER_PREFIXES = ["/partner"];
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
    const role = user?.app_metadata?.role as "USER" | "PARTNER" | undefined;

    const redirect = (to: string, search = "") => {
        const url = request.nextUrl.clone();
        url.pathname = to;
        url.search = search;
        return NextResponse.redirect(url);
    };

    // 미로그인 상태로 보호 라우트 접근 → 로그인으로
    if (
        !user &&
        (matches(pathname, USER_PREFIXES) ||
            matches(pathname, PARTNER_PREFIXES))
    ) {
        return redirect("/login");
    }

    if (user) {
        const PARTNER_HOME = "/partner";

        // 이미 로그인했는데 로그인/회원가입 페이지 접근 → 역할별 홈으로
        if (matches(pathname, AUTH_PAGES)) {
            return redirect(role === "PARTNER" ? PARTNER_HOME : "/");
        }

        if (role === "PARTNER") {
            // 파트너는 파트너 영역(/partner) 밖 = 사용자 영역 전체 접근 차단
            if (!matches(pathname, PARTNER_PREFIXES)) {
                return redirect(PARTNER_HOME, "?blocked=user");
            }
        } else {
            // 사용자(또는 역할 미지정)는 파트너 영역 접근 차단
            if (matches(pathname, PARTNER_PREFIXES)) {
                return redirect("/", "?blocked=partner");
            }
            // USER 전용 라우트인데 역할이 USER가 아니면 차단
            if (role !== "USER" && matches(pathname, USER_PREFIXES)) {
                return redirect("/");
            }
        }
    }

    return response;
}
