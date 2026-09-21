import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { isValidEmail, normalizeEmail } from "@/lib/otp";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

const DUTIES = new Set(["계정", "심사", "정산"]);

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

    const input = body as Record<string, unknown>;
    const name = typeof input.name === "string" ? input.name.trim() : "";
    const email =
        typeof input.email === "string" ? normalizeEmail(input.email) : "";
    const duty = typeof input.duty === "string" ? input.duty : "";
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if (
        name.length < 2 ||
        name.length > 50 ||
        email.length > 254 ||
        !isValidEmail(email) ||
        !DUTIES.has(duty) ||
        reason.length < 5 ||
        reason.length > 500
    ) {
        return NextResponse.json(
            { message: "이름, 이메일, 담당 업무와 발급 사유를 확인해 주세요." },
            { status: 400 },
        );
    }

    const { data: canIssueDuty } = await supabase.rpc("can_issue_admin_duty", {
        p_duty: duty,
    });
    if (canIssueDuty !== true) {
        return NextResponse.json(
            { message: "선택한 담당 업무를 발급할 권한이 없습니다." },
            { status: 403 },
        );
    }

    const temporaryPassword = `Hkg!${randomBytes(18).toString("base64url")}`;
    const admin = createAdminClient();
    const created = await admin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        app_metadata: { must_change_password: true },
    });
    if (created.error || !created.data.user) {
        const duplicate =
            created.error?.code === "email_exists" ||
            /exist|registered/i.test(created.error?.message ?? "");
        return NextResponse.json(
            {
                message: duplicate
                    ? "이미 등록된 이메일입니다. 기존 계정은 관리자로 승격할 수 없습니다."
                    : "관리자 계정 발급에 실패했습니다.",
            },
            { status: duplicate ? 409 : 500 },
        );
    }

    const target = created.data.user.id;
    const { error: profileError } = await admin.from("profiles").insert({
        id: target,
        role: "USER",
        name,
        email,
        status: "ACTIVE",
    });
    if (profileError) {
        await admin.auth.admin.deleteUser(target);
        return NextResponse.json(
            { message: "관리자 계정 발급에 실패했습니다." },
            { status: 500 },
        );
    }

    const { error: grantError } = await supabase.rpc("admin_grant_role", {
        p_target: target,
        p_duty: duty,
        p_reason: reason,
    });
    if (grantError) {
        await admin.auth.admin.deleteUser(target);
        return NextResponse.json(
            { message: "관리자 권한 부여에 실패했습니다." },
            { status: 500 },
        );
    }

    return NextResponse.json(
        { id: target, email, temporaryPassword },
        { status: 201, headers: { "Cache-Control": "no-store" } },
    );
}
