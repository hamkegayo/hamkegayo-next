import { type NextRequest } from "next/server";

import { updateSession } from "@/utils/supabase/middleware";

export async function middleware(request: NextRequest) {
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
