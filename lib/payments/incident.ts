import { createAdminClient } from "@/utils/supabase/admin";
import { getEmailSender } from "@/lib/email";

/**
 * 결제 사고 기록·알림 (#79).
 *
 *  ⚠️ **이 모듈은 절대 던지지 않는다.**
 *     승인 라우트의 보상 처리 도중에 호출되므로, 여기서 예외가 나면
 *     이미 처리된 결제까지 되돌릴 수 없게 된다.
 *     적재가 실패해도 알림은 시도하고, 알림이 실패해도 적재는 남긴다.
 *
 *  ⚠️ **개인정보를 담지 않는다.**
 *     `detail` 과 메일 본문에는 예약번호·주문번호·금액·PG 응답까지만 넣는다.
 *     환자 정보가 필요하면 관리자가 예약번호로 RPC 를 통해 조회한다 —
 *     그래야 `access_logs` 에 남는다(#50).
 */

/** 사고 유형 — DB 열거형과 같은 값 */
export type IncidentKind =
    | "CANCEL_FAILED" // 승인 취소 실패 — 돈 받고 예약 없음
    | "APPROVE_INDETERMINATE" // 타임아웃 — 승인 여부 불명
    | "POINT_RESTORE_FAILED" // 포인트 미복원
    | "STATE_MISMATCH" // PG 는 PAID 인데 DB 는 아님
    | "AMOUNT_MISMATCH" // 유효 서명 + 금액 위조 — 공격 신호
    | "UNKNOWN_ORDER" // 우리가 만들지 않은 주문 승인 시도
    | "FINALIZE_FAILED" // 확정 실패(취소는 성공)
    | "REFUND_FAILED" // 환불 요청했는데 PG 취소가 실패
    | "REFUND_RECORD_FAILED"; // PG 취소는 됐는데 DB 기록 실패 — 이중 환불 위험

export type IncidentSeverity = "CRITICAL" | "HIGH" | "MEDIUM";

/**
 * 유형별 심각도와 담당자가 할 일 — 메일 본문에 그대로 들어간다.
 *
 *  label   : 제목·표에 쓰는 **짧은 이름**. 길면 메일 제목이 스캔되지 않는다
 *  summary : 무슨 일이 일어났는지 한 문장
 *  action  : 담당자가 지금 할 일
 */
const INCIDENT_INFO: Record<
    IncidentKind,
    {
        severity: IncidentSeverity;
        label: string;
        summary: string;
        action: string;
    }
> = {
    CANCEL_FAILED: {
        severity: "CRITICAL",
        label: "승인 취소 실패",
        summary: "돈은 받았는데 예약이 잡히지 않았습니다.",
        action: "NICEPAY 관리자에서 해당 거래를 수동 취소하고 고객에게 안내하세요.",
    },
    APPROVE_INDETERMINATE: {
        severity: "CRITICAL",
        label: "승인 응답 미수신",
        summary: "승인이 나갔는지 알 수 없습니다.",
        action: "NICEPAY 관리자에서 거래 상태를 확인하세요. 승인됐다면 취소가 필요합니다. ⚠️ 재시도하지 마세요 — 이중 청구가 납니다.",
    },
    STATE_MISMATCH: {
        severity: "HIGH",
        label: "결제 상태 불일치",
        summary: "PG 는 결제 완료인데 우리 DB 는 아닙니다.",
        action: "PG 상태를 기준으로 예약을 수동 확정하거나 결제를 취소하세요.",
    },
    POINT_RESTORE_FAILED: {
        severity: "HIGH",
        label: "포인트 복원 실패",
        summary: "고객 포인트가 차감된 채 남았습니다.",
        action: "points 원장에 USE_CANCEL 을 수동 적재해 잔액을 되돌리세요.",
    },
    AMOUNT_MISMATCH: {
        severity: "HIGH",
        label: "결제 금액 불일치",
        summary:
            "서명은 유효한데 요청 금액이 달랐습니다. 위변조 시도일 수 있습니다.",
        action: "승인은 차단됐습니다. 반복되면 공격이므로 로그와 IP 를 확인하세요.",
    },
    FINALIZE_FAILED: {
        severity: "MEDIUM",
        label: "예약 확정 실패",
        summary: "결제 승인 후 예약 확정에 실패해 결제를 취소했습니다.",
        action: "고객 결제는 취소됐습니다. 예약 상태를 확인하고 재시도를 안내하세요.",
    },
    REFUND_RECORD_FAILED: {
        severity: "CRITICAL",
        label: "환불 기록 실패",
        summary: "환불은 나갔는데 우리 DB 에 남지 않았습니다.",
        action: "payments 에 REFUND 행을 수동 적재하고 예약을 취소 상태로 맞추세요. ⚠️ 환불을 재시도하지 마세요 — 두 번 나갑니다.",
    },
    REFUND_FAILED: {
        severity: "HIGH",
        label: "환불 실패",
        summary: "고객이 취소했는데 환불이 나가지 않았습니다.",
        action: "NICEPAY 관리자에서 수동 취소하고 고객에게 안내하세요. 예약은 그대로 남아 있습니다.",
    },
    UNKNOWN_ORDER: {
        severity: "MEDIUM",
        label: "알 수 없는 주문 승인 시도",
        summary: "우리가 만들지 않은 주문번호로 승인이 시도됐습니다.",
        action: "망취소를 시도했습니다. 반복되면 공격 신호이니 로그를 확인하세요.",
    },
};

/** 심각도 표시 — 본문이 한글이므로 enum 을 그대로 노출하지 않는다 */
const SEVERITY_LABEL: Record<IncidentSeverity, string> = {
    CRITICAL: "긴급",
    HIGH: "높음",
    MEDIUM: "보통",
};

const SEVERITY_MARK: Record<IncidentSeverity, string> = {
    CRITICAL: "🔴",
    HIGH: "🟠",
    MEDIUM: "🟡",
};

export type IncidentInput = {
    kind: IncidentKind;
    orderId?: string | null;
    paymentId?: string | null;
    reservationCode?: string | null;
    amount?: number | null;
    /** PG 응답 코드·메시지 등. ⚠️ 개인정보 금지 */
    detail?: Record<string, unknown>;
};

/**
 * 알림 채널. 지금은 이메일뿐이지만 나중에 Slack·알림톡을 붙일 때
 * 호출 지점 10곳을 다시 고치지 않도록 인터페이스로 분리해 둔다.
 */
interface IncidentNotifier {
    notify(subject: string, body: string): Promise<void>;
}

/** 이메일 알림 — PAYMENT_ALERT_EMAIL 미설정이면 보내지 않는다 */
class EmailNotifier implements IncidentNotifier {
    async notify(subject: string, body: string): Promise<void> {
        const to = process.env.PAYMENT_ALERT_EMAIL?.trim();
        if (!to) return; // 수신자가 없으면 적재만 하고 조용히 넘어간다

        await getEmailSender().send(to, subject, body);
    }
}

let notifier: IncidentNotifier = new EmailNotifier();

/** 테스트·다른 채널 전환용. 운영 코드에서는 부르지 않는다. */
export function setIncidentNotifier(next: IncidentNotifier) {
    notifier = next;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function buildEmail(
    input: IncidentInput,
    info: (typeof INCIDENT_INFO)[IncidentKind],
): { subject: string; html: string } {
    const mark = SEVERITY_MARK[info.severity];
    const level = SEVERITY_LABEL[info.severity];

    // 사고 유형은 제목·머리말에 이미 있으므로 표에서는 뺀다.
    const rows: [string, string][] = [
        ["심각도", `${mark} ${level}`],
        ["주문번호", input.orderId ?? "-"],
        ["예약번호", input.reservationCode ?? "-"],
        [
            "금액",
            input.amount != null ? `${input.amount.toLocaleString()}원` : "-",
        ],
        [
            "발생시각",
            new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
        ],
    ];

    const detail = input.detail
        ? escapeHtml(JSON.stringify(input.detail, null, 2))
        : "";

    return {
        // 받은편지함에서 잘려도 "무슨 사고인지" 가 먼저 보이도록 배치한다.
        subject: `[함께가요] ${mark} 결제 사고 · ${info.label}`,
        html: `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#6b7280">
        ${mark} 심각도 ${level}
      </p>
      <h2 style="margin:0 0 8px;color:#111827">${escapeHtml(info.label)}</h2>
      <p style="margin:0 0 20px;color:#4b5563;line-height:1.6">${escapeHtml(info.summary)}</p>

      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${rows
            .map(
                ([k, v]) => `<tr>
          <td style="padding:8px 0;color:#6b7280;width:96px">${k}</td>
          <td style="padding:8px 0;color:#111827;font-weight:600">${escapeHtml(String(v))}</td>
        </tr>`,
            )
            .join("")}
      </table>

      <div style="margin:20px 0;padding:14px 16px;background:#fef2f2;border-radius:8px">
        <p style="margin:0;font-weight:700;color:#991b1b">조치 방법</p>
        <p style="margin:6px 0 0;color:#7f1d1d;line-height:1.6">${escapeHtml(info.action)}</p>
      </div>

      ${
          detail
              ? `<pre style="background:#f3f4f6;padding:12px;border-radius:8px;font-size:12px;overflow:auto">${detail}</pre>`
              : ""
      }

      <p style="margin:20px 0 0;font-size:12px;color:#9ca3af">
        이 메일에는 고객 개인정보가 담기지 않습니다. 상세 확인은 관리자 화면에서 예약번호로 조회하세요.
      </p>
    </div>`,
    };
}

/**
 * 사고를 기록하고 담당자에게 알린다.
 *
 *  적재와 알림을 독립적으로 시도한다 — 하나가 실패해도 다른 하나는 남는다.
 *  어떤 경우에도 던지지 않는다.
 */
export async function reportIncident(input: IncidentInput): Promise<void> {
    const info = INCIDENT_INFO[input.kind];

    // 콘솔에도 남긴다. 적재·알림이 모두 실패해도 최소한 로그는 있어야 한다.
    console.error(
        `[payment-incident] ${info.severity} ${input.kind} order=${input.orderId ?? "-"} payment=${input.paymentId ?? "-"}`,
        input.detail ?? {},
    );

    // ---------- 적재 ----------
    try {
        const admin = createAdminClient();
        const { error } = await admin.rpc("report_payment_incident", {
            p_kind: input.kind,
            p_severity: info.severity,
            p_order_id: input.orderId ?? null,
            p_payment_id: input.paymentId ?? null,
            p_amount: input.amount ?? null,
            p_detail: input.detail ?? null,
        });
        if (error) {
            console.error("[payment-incident] 적재 실패", error);
        }
    } catch (e) {
        console.error("[payment-incident] 적재 예외", e);
    }

    // ---------- 알림 ----------
    try {
        const { subject, html } = buildEmail(input, info);
        await notifier.notify(subject, html);
    } catch (e) {
        console.error("[payment-incident] 알림 실패", e);
    }
}
