"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { logout } from "@/app/(user)/_actions/auth";

/**
 * 로그아웃 공용 훅 — 세션 종료(서버 액션) 후 지정 경로로 이동한다.
 * 진입점 4곳(사용자/파트너 헤더, 마이페이지 사이드바, 모바일 네비)에서 공유해
 * 로직을 한 곳에서 관리한다.
 *
 * - 중복 클릭 방지(`pending`)
 * - 성공 시 pending 을 유지한 채 이동(이 컴포넌트가 언마운트됨)해 버튼 깜빡임 방지
 * - 실패(드묾) 시에만 pending 해제 + 에러 토스트
 *
 * @param redirectTo 로그아웃 후 이동 경로 (기본 "/login")
 */
export function useLogout(redirectTo = "/login") {
    const router = useRouter();
    const [pending, setPending] = useState(false);

    const runLogout = async () => {
        if (pending) return;
        setPending(true);
        try {
            await logout();
            router.replace(redirectTo);
            router.refresh();
        } catch {
            toast.error("로그아웃 중 오류가 발생했습니다. 다시 시도해 주세요.");
            setPending(false);
        }
    };

    return { logout: runLogout, pending };
}
