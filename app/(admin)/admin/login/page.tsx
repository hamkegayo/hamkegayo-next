import type { Metadata } from "next";

import { AdminLoginForm } from "./_components/admin-login-form";

export const metadata: Metadata = {
    title: "관리자 로그인",
    robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
    return <AdminLoginForm />;
}
