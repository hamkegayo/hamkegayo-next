import type { Metadata } from "next";

import { InstallPrompt } from "@/components/pwa/install-prompt";
import { SignupForm } from "./_components/signup-form";

export const metadata: Metadata = {
    title: "회원가입",
};

export default function SignupPage() {
    return (
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
            <SignupForm />
            {/* 모바일 PWA 설치 유도 (#117) — 재방문 의사가 있는 사람에게만 */}
            <InstallPrompt />
        </div>
    );
}
