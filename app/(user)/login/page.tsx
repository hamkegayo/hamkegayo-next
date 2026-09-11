import type { Metadata } from "next";

import { InstallPrompt } from "@/components/pwa/install-prompt";
import { LoginForm } from "./_components/login-form";

export const metadata: Metadata = {
    title: "로그인",
};

export default function LoginPage() {
    return (
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
            <LoginForm />
            {/* 모바일 PWA 설치 유도 (#117) — 재방문 의사가 있는 사람에게만 */}
            <InstallPrompt />
        </div>
    );
}
