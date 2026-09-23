"use client";

import { logoutAdmin } from "./logout-action";

export function LogoutButton() {
    return (
        <form action={logoutAdmin}>
            <button
                type="submit"
                className="border-border text-muted-foreground hover:text-foreground rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors"
            >
                로그아웃
            </button>
        </form>
    );
}
