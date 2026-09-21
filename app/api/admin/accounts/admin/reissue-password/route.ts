import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
    if (request.headers.get("origin") !== request.nextUrl.origin) {
        return NextResponse.json(
            { message: "잘못된 요청입니다." },
            { status: 403 },
        );
    }

    const body = (await request.json().catch(() => null)) as unknown;
    if (!body || typeof body !== "object") {
        return NextResponse.json(
            { message: "입력값을 확인해 주세요." },
            { status: 400 },
        );
    }
    const input = body as Record<string, unknown>;
    const targetId =
        typeof input.targetId === "string" ? input.targetId.trim() : "";
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if (
        !UUID_PATTERN.test(targetId) ||
        reason.length < 5 ||
        reason.length > 500
    ) {
        return NextResponse.json(
            { message: "재발급 사유를 5~500자로 입력해 주세요." },
            { status: 400 },
        );
    }

    const supabase = await createClient();
    const { error: authorizationError } = await supabase.rpc(
        "admin_authorize_password_reissue",
        { p_target: targetId, p_reason: reason },
    );
    if (authorizationError) {
        return NextResponse.json(
            {
                message:
                    "재발급 권한이 없거나 이미 최초 비밀번호 변경을 완료한 계정입니다.",
            },
            { status: 403 },
        );
    }

    const temporaryPassword = `Hkg!${randomBytes(18).toString("base64url")}`;
    const admin = createAdminClient();
    const { data: target, error: readError } =
        await admin.auth.admin.getUserById(targetId);
    if (readError || !target.user) {
        return NextResponse.json(
            { message: "임시 비밀번호 재발급에 실패했습니다." },
            { status: 500 },
        );
    }
    const { error: updateError } = await admin.auth.admin.updateUserById(
        targetId,
        {
            password: temporaryPassword,
            app_metadata: {
                ...target.user.app_metadata,
                must_change_password: true,
            },
        },
    );
    if (updateError) {
        return NextResponse.json(
            { message: "임시 비밀번호 재발급에 실패했습니다." },
            { status: 500 },
        );
    }

    return NextResponse.json(
        { temporaryPassword },
        { headers: { "Cache-Control": "no-store" } },
    );
}
