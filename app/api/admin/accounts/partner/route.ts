import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { partnerEmail } from "@/lib/partner";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

const LOGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{3,31}$/;

export async function POST(request: NextRequest) {
    if (request.headers.get("origin") !== request.nextUrl.origin) {
        return NextResponse.json(
            { message: "잘못된 요청입니다." },
            { status: 403 },
        );
    }

    const supabase = await createClient();
    const [{ data: allowed }, body] = await Promise.all([
        supabase.rpc("can_issue_accounts"),
        request.json().catch(() => null) as Promise<unknown>,
    ]);
    if (allowed !== true) {
        return NextResponse.json(
            { message: "계정 발급 권한이 없습니다." },
            { status: 403 },
        );
    }
    if (!body || typeof body !== "object") {
        return NextResponse.json(
            { message: "입력값을 확인해 주세요." },
            { status: 400 },
        );
    }

    const input = body as { loginId?: unknown; reason?: unknown };
    const loginId =
        typeof input.loginId === "string"
            ? input.loginId.trim().toLowerCase()
            : "";
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if (
        !LOGIN_ID_PATTERN.test(loginId) ||
        reason.length < 5 ||
        reason.length > 500
    ) {
        return NextResponse.json(
            { message: "아이디와 발급 사유를 확인해 주세요." },
            { status: 400 },
        );
    }

    const admin = createAdminClient();
    const created = await admin.auth.admin.createUser({
        email: partnerEmail(loginId),
        password: randomBytes(32).toString("base64url"),
        email_confirm: true,
    });
    if (created.error || !created.data.user) {
        const duplicate =
            created.error?.code === "email_exists" ||
            /exist|registered/i.test(created.error?.message ?? "");
        return NextResponse.json(
            {
                message: duplicate
                    ? "이미 발급된 아이디입니다."
                    : "계정 발급에 실패했습니다.",
            },
            { status: duplicate ? 409 : 500 },
        );
    }

    const target = created.data.user.id;
    const { error } = await supabase.rpc("admin_register_partner_account", {
        p_target: target,
        p_login_id: loginId,
        p_reason: reason,
    });
    if (error) {
        await admin.auth.admin.deleteUser(target);
        const duplicate = error.code === "23505";
        return NextResponse.json(
            {
                message: duplicate
                    ? "이미 발급된 아이디입니다."
                    : "계정 발급에 실패했습니다.",
            },
            { status: duplicate ? 409 : 500 },
        );
    }

    return NextResponse.json({ loginId }, { status: 201 });
}
