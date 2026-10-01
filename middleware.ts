import { NextResponse, type NextRequest } from "next/server";

import { NAVER_USERINFO_PATH } from "@/lib/auth/social";

import { updateSession } from "@/utils/supabase/middleware";

export async function middleware(request: NextRequest) {
    // Supabase Auth 서버가 네이버 토큰으로 호출한다. 사이트 세션 쿠키를 요구하지 않는다.
    if (request.nextUrl.pathname === NAVER_USERINFO_PATH) {
        return NextResponse.next();
    }
    return await updateSession(request);
}

export const config = {
    // 정적 파일/이미지 등은 제외
    //  manifest.webmanifest · sw.js 도 뺀다 (#116). 세션 미들웨어를 타다가
    //  리다이렉트되면 **SW 등록 자체가 조용히 실패한다.**
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
