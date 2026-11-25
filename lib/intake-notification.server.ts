import { after } from "next/server";

import { getEmailSender, isEmailDeliveryConfigured } from "@/lib/email";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * 운영자 신규 접수 이메일 알림 (#300).
 *
 *  접수 행(reservation_intakes)은 결제 승인·저장과 같은 DB 트랜잭션에서 만들어진다(finalize_payment).
 *  여기서는 그 행을 읽어 발송하고 결과를 기록한다. 결제 응답을 막지 않도록 after() 에서 부른다.
 *
 *  · 수신자 — INTAKE_ALERT_EMAIL (쉼표로 여러 명). 하위 호환으로 PAYMENT_ALERT_EMAIL 도 함께 쓰며,
 *    둘 다 있으면 중복 주소를 제거하고 합쳐 보낸다. 값은 코드·로그에 남기지 않는다.
 *  · 중복 방지 — DB 큐의 claim(SKIP LOCKED + 임대)이 같은 건의 동시 발송을 막고, 접수 행이
 *    결제당 하나(unique)라 재콜백·재요청이 새 접수를 만들지 않는다. SENT 가 된 건은 다시 집지 않는다.
 *  · 재시도 — 실패는 지수 백오프(최대 60분)로 8회까지. 그 이후는 관리자 목록에 FAILED 로 남아 운영자가 본다.
 *  · 모의 발송 — RESEND_API_KEY 가 없으면 발송하지 않고 건을 PENDING 으로 둔다(성공으로 기록하지 않는다).
 *    수신자가 없을 때도 같다. 운영에서 설정이 빠졌다면 관리자 목록의 "발송 대기" 로 드러난다.
 *  · 본문 — 접수 사실·예약번호·관리자 링크만 담는다. 일시·서비스·병원·성명·건강정보는 넣지 않는다.
 *    처리방침 제6조의 Resend 위탁 범위가 확인되기 전까지 파트너 새 요청 메일과 같은 축소안이다.
 */

function siteBase(): string {
    return (
        process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
        "https://www.hamkegayo.kr"
    );
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** 수신자 목록. 쉼표·공백 구분, 빈 값 제거. */
export function intakeRecipients(raw: string | undefined | null): string[] {
    return (raw ?? "")
        .split(/[,\s]+/)
        .map((v) => v.trim())
        .filter(Boolean);
}

/**
 * 접수 알림 최종 수신자. INTAKE_ALERT_EMAIL 과 PAYMENT_ALERT_EMAIL(하위 호환)을 합치고
 * 대소문자·공백을 무시해 중복 주소를 한 번만 남긴다.
 */
export function resolveIntakeRecipients(): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const address of [
        ...intakeRecipients(process.env.INTAKE_ALERT_EMAIL),
        ...intakeRecipients(process.env.PAYMENT_ALERT_EMAIL),
    ]) {
        const key = address.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(address);
    }
    return result;
}

export function buildIntakeEmail(
    siteUrl: string,
    reservation: { id: string; code: string },
): { subject: string; html: string } {
    const link = `${siteUrl.replace(/\/$/, "")}/admin/reservations/${encodeURIComponent(reservation.id)}`;
    return {
        subject: `[함께가요] 신규 예약 접수 · ${reservation.code}`,
        html: `
<p>결제가 완료된 신규 예약이 접수되었어요. 파트너를 배정해 주세요.</p>
<p>예약번호: <strong>${escapeHtml(reservation.code)}</strong></p>
<p><a href="${link}">관리자 화면에서 확인하기</a></p>
<p style="color:#888;font-size:12px">예약 상세 내용은 관리자 화면에서만 확인할 수 있어요. 결제 후 24시간이 지나면 관리자 화면에 경고가 표시됩니다.</p>`,
    };
}

export type IntakeDispatchResult = {
    /** 발송을 시도한 건수 */
    claimed: number;
    sent: number;
    failed: number;
    /** 설정 미비로 시도하지 않았다(건은 PENDING 으로 남는다) */
    skipped?: "EMAIL_NOT_CONFIGURED" | "NO_RECIPIENT";
};

type ClaimedIntakeRow = {
    intake_id: string;
    reservation_id: string;
    reservation_code: string;
};

async function runIntakeDispatch(
    claim: (
        admin: ReturnType<typeof createAdminClient>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<IntakeDispatchResult> {
    const result: IntakeDispatchResult = { claimed: 0, sent: 0, failed: 0 };
    try {
        const to = resolveIntakeRecipients();
        if (to.length === 0) {
            console.error(
                "[intake] 운영자 수신 주소(INTAKE_ALERT_EMAIL)가 설정되지 않아 접수 알림을 보내지 않습니다.",
            );
            return { ...result, skipped: "NO_RECIPIENT" };
        }
        if (!isEmailDeliveryConfigured()) {
            console.error(
                "[intake] 이메일 발송 키가 없어 접수 알림을 보내지 않습니다(모의 발송은 성공으로 기록하지 않음).",
            );
            return { ...result, skipped: "EMAIL_NOT_CONFIGURED" };
        }

        const admin = createAdminClient();
        const { data, error } = await claim(admin);
        if (error) {
            console.error("[intake] 발송 대상 조회 실패:", error.message);
            return result;
        }

        const rows = (data ?? []) as ClaimedIntakeRow[];
        result.claimed = rows.length;
        const sender = getEmailSender();

        for (const row of rows) {
            const mail = buildIntakeEmail(siteBase(), {
                id: row.reservation_id,
                code: row.reservation_code,
            });
            let ok = true;
            let message: string | null = null;
            try {
                await Promise.all(
                    to.map((address) =>
                        sender.send(address, mail.subject, mail.html),
                    ),
                );
            } catch (e) {
                ok = false;
                message = e instanceof Error ? e.message : String(e);
                console.error("[intake] 접수 메일 발송 실패:", message);
            }
            const { error: recordError } = await admin.rpc(
                "record_intake_notification_result",
                {
                    p_intake: row.intake_id,
                    p_ok: ok,
                    p_error: message ?? undefined,
                },
            );
            if (recordError)
                console.error(
                    "[intake] 발송 결과 기록 실패:",
                    recordError.message,
                );
            if (ok) result.sent += 1;
            else result.failed += 1;
        }
    } catch (e) {
        console.error("[intake] 접수 알림 처리 실패:", e);
    }
    return result;
}

/** 발송 대기 중인 접수 알림을 보낸다. 실패해도 던지지 않는다. */
export async function dispatchIntakeNotifications(
    limit = 10,
): Promise<IntakeDispatchResult> {
    return runIntakeDispatch((admin) =>
        admin.rpc("claim_intake_notifications", { p_limit: limit }),
    );
}

/** 특정 예약 1건의 접수 알림만 대상으로 임대·발송한다 (관리자 수동 재발송용). */
export async function dispatchIntakeNotificationForReservation(
    reservationId: string,
): Promise<IntakeDispatchResult> {
    return runIntakeDispatch((admin) =>
        admin.rpc("claim_intake_notification_for_reservation", {
            p_reservation: reservationId,
        }),
    );
}

/** 요청 응답을 막지 않게 발송을 예약한다. 요청 범위 밖이면 바로 시도한다. */
export function scheduleIntakeDispatch(): void {
    try {
        after(() => dispatchIntakeNotifications());
    } catch {
        void dispatchIntakeNotifications();
    }
}
