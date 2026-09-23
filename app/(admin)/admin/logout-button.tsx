"use client";

import { logoutAdmin } from "./logout-action";

export function LogoutButton() {
    return (
        <form action={logoutAdmin}>
            <button
                type="submit"
                className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            >
                로그아웃
            </button>
        </form>
    );
}
