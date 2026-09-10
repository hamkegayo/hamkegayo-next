import type { Metadata } from "next";

import { ForgotPasswordForm } from "./_components/forgot-password-form";

export const metadata: Metadata = {
    title: "비밀번호 찾기",
};

export default function ForgotPasswordPage() {
    return (
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
            <ForgotPasswordForm />
        </div>
    );
}
