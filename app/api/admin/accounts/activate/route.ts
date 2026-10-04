import { NextResponse, type NextRequest } from "next/server";

import { isValidPassword, PASSWORD_RULE_MESSAGE } from "@/lib/password";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest) {
    if (request.headers.get("origin") !== request.nextUrl.origin) {
        return NextResponse.json(
            { message: "잘못된 요청입니다." },
            { status: 403 },
        );
    }

    const supabase = await createClient();
    const [
        {
            data: { user },
        },
        body,
    ] = await Promise.all([
        supabase.auth.getUser(),
        request.json().catch(() => null) as Promise<unknown>,
    ]);
    if (
        !user ||
        user.app_metadata?.role !== "ADMIN" ||
        user.app_metadata?.status !== "ACTIVE" ||
        user.app_metadata?.must_change_password !== true
    ) {
        return NextResponse.json(
            { message: "초기 비밀번호 변경 대상이 아닙니다." },
            { status: 403 },
        );
    }

    const password =
        body &&
        typeof body === "object" &&
        "password" in body &&
        typeof body.password === "string"
            ? body.password
            : "";
    if (!isValidPassword(password)) {
        return NextResponse.json(
            { message: PASSWORD_RULE_MESSAGE },
            { status: 400 },
        );
    }

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(user.id, {
        password,
        app_metadata: {
            ...user.app_metadata,
            must_change_password: false,
        },
    });
    if (error) {
        return NextResponse.json(
            { message: "비밀번호 변경에 실패했습니다." },
            { status: 500 },
        );
    }

    return NextResponse.json({ ok: true });
}
