import { NextResponse, type NextRequest } from "next/server";

import { KAKAO_UNLINK_PATH, NAVER_USERINFO_PATH } from "@/lib/auth/social";

import { updateSession } from "@/utils/supabase/middleware";

export async function middleware(request: NextRequest) {
    // Supabase Auth 서버(네이버 토큰)와 카카오 웹훅 서버(어드민 키)가 호출한다.
    // 사이트 세션 쿠키를 요구하지 않는다.
    const path = request.nextUrl.pathname;
    if (path === NAVER_USERINFO_PATH || path === KAKAO_UNLINK_PATH) {
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
