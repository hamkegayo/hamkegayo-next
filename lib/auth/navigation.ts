import { safeInternalPath } from "./social";

/** 로그인/회원가입을 오가더라도 검증된 내부 복귀 경로를 보존한다. */
export function authPageWithNext(
    page: "/login" | "/signup",
    next?: string | null,
): string {
    const destination = safeInternalPath(next);
    return destination === "/"
        ? page
        : `${page}?${new URLSearchParams({ next: destination })}`;
}
