import { createAdminClient } from "@/utils/supabase/admin";
import { createNotification } from "@/lib/notifications";
import { getEmailSender } from "@/lib/email";
import { generateOrderId, generatePayToken } from "@/lib/payments/order";
import { EXTENSION_REVIEW_THRESHOLD } from "@/lib/pricing";

/**
 * 추가결제 링크 발급 (#75) — 약관 제21조 ⑤ · 제22조.
 *
 *  서비스 종료 시 최종 이용요금이 선결제액을 넘으면 초과분만 결제하는
 *  링크를 발급한다. 금액 계산은 이미 되고 있었다(#46) — **그 차액으로
 *  아무것도 하지 않는 것**이 이 모듈이 메우는 구멍이다.
 *
 *  ⚠️ 링크는 문자·메일로 흘러다니고 받는 사람이 예약자가 아닐 수 있다.
 *     토큰으로 조회할 때 환자 정보를 내리지 않는다(`get_extension_charge`).
 */

/** 청구 사유 — DB `payments.charge_reason` 과 같은 값 */
export type ChargeReason = "EXTENSION" | "NO_SHOW";

const REASON_LABEL: Record<ChargeReason, string> = {
    EXTENSION: "이용시간 연장",
    NO_SHOW: "이용자 미도착",
};

/**
 * 링크 유효기간(일).
 *
 *  약관에 기한 조문이 없어 리뷰에서 확정했다(2026-09-05). 대리 결제와
 *  주말 CS 대응을 감안한 값이다 — 금요일 저녁에 종료된 건이 월요일 업무
 *  시작까지 살아 있어야 한다. 조문이 생기면 그 값을 따른다.
 */
const TOKEN_VALID_DAYS = 3;

export type ExtensionChargeResult =
    | {
          ok: true;
          paymentId: string;
          amount: number;
          /** 소프트 상한 초과 — 링크를 아직 보내지 않았다 */
          reviewRequired: boolean;
          already: boolean;
      }
    | { ok: false; reason: "NO_CHARGE" | "FAILED" };

/** 결제 링크 절대 주소. 메일에 넣으려면 상대경로로는 안 된다. */
function payUrl(token: string): string {
    const base =
        process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
        "https://www.hamkegayo.kr";
    return `${base}/pay/${token}`;
}

function buildEmail(params: {
    amount: number;
    reason: ChargeReason;
    useDate: string;
    url: string;
}): { subject: string; html: string } {
    const label = REASON_LABEL[params.reason];
    return {
        subject: `[함께가요] 추가 결제 안내 · ${params.amount.toLocaleString()}원`,
        html: `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="margin:0 0 16px;color:#111827">추가 결제 안내</h2>
      <p style="margin:0 0 20px;color:#4b5563;line-height:1.6">
        ${params.useDate} 이용하신 병원동행 서비스의 ${label}분 요금이 확정되었습니다.
      </p>
      <div style="font-size:28px;font-weight:800;color:#2e9ce6;text-align:center;padding:18px 0;background:#f0f9ff;border-radius:12px">
        ${params.amount.toLocaleString()}원
      </div>
      <p style="margin:24px 0 0;text-align:center">
        <a href="${params.url}" style="display:inline-block;background:#2e9ce6;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:700">
          결제하기
        </a>
      </p>
      <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;line-height:1.6">
        결제 링크는 ${TOKEN_VALID_DAYS}일간 유효합니다.
        이 메일에는 이용자 정보가 담겨 있지 않습니다.
      </p>
    </div>`,
    };
}

/**
 * 추가결제를 발급하고 고객에게 알린다.
 *
 *  실패해도 던지지 않는다 — 서비스 종료 처리 도중에 호출되므로 여기서
 *  예외가 나면 종료 자체가 막힌다. 실패는 로그로 남기고 넘어간다.
 *
 *  소프트 상한을 넘으면 **링크를 보내지 않는다.** 종료 시각을 잘못 눌러
 *  큰 금액이 잡힌 경우가 있어 사람이 한 번 본다(#75 · 2026-09-05 기획).
 */
export async function issueExtensionCharge(params: {
    reservationId: string;
    reservationCode: string;
    customerId: string;
    /** 추가로 받을 금액(원, 양수) */
    amount: number;
    reason: ChargeReason;
    /** 안내 문구에 쓸 이용일 ("2026-09-05") */
    useDate: string;
}): Promise<ExtensionChargeResult> {
    if (params.amount <= 0) return { ok: false, reason: "NO_CHARGE" };

    try {
        const admin = createAdminClient();
        const token = generatePayToken();
        const expires = new Date(
            Date.now() + TOKEN_VALID_DAYS * 86_400_000,
        ).toISOString();

        const { data, error } = await admin.rpc("create_extension_payment", {
            p_reservation_id: params.reservationId,
            p_amount: params.amount,
            p_reason: params.reason,
            p_order_id: generateOrderId(params.reservationCode),
            p_token: token,
            p_token_expires: expires,
            p_review_threshold: EXTENSION_REVIEW_THRESHOLD,
        });

        if (error || !data) {
            console.error("[extension] 발급 실패:", error);
            return { ok: false, reason: "FAILED" };
        }

        const issued = data as {
            already: boolean;
            payment_id: string;
            token: string;
            amount: number;
            review_required: boolean;
        };

        // 상한을 넘었으면 관리자가 확인할 때까지 보내지 않는다.
        if (issued.review_required) {
            await notifyAdmins(params, issued.amount);
            return {
                ok: true,
                paymentId: issued.payment_id,
                amount: issued.amount,
                reviewRequired: true,
                already: issued.already,
            };
        }

        if (!issued.already) {
            await sendLink(admin, params, issued);
        }

        return {
            ok: true,
            paymentId: issued.payment_id,
            amount: issued.amount,
            reviewRequired: false,
            already: issued.already,
        };
    } catch (e) {
        console.error("[extension] 발급 예외:", e);
        return { ok: false, reason: "FAILED" };
    }
}

/** 인앱 알림 + 이메일. 하나가 실패해도 다른 하나는 나간다. */
async function sendLink(
    admin: ReturnType<typeof createAdminClient>,
    params: Parameters<typeof issueExtensionCharge>[0],
    issued: { payment_id: string; token: string; amount: number },
) {
    const url = payUrl(issued.token);

    await createNotification(params.customerId, {
        type: "PAYMENT_ADDITIONAL",
        title: "추가 결제가 필요해요",
        body: `${REASON_LABEL[params.reason]}분 ${issued.amount.toLocaleString()}원을 결제해 주세요.`,
        link: `/pay/${issued.token}`,
    });

    const { data: profile } = await admin
        .from("profiles")
        .select("email")
        .eq("id", params.customerId)
        .maybeSingle();

    if (profile?.email) {
        try {
            const mail = buildEmail({
                amount: issued.amount,
                reason: params.reason,
                useDate: params.useDate,
                url,
            });
            await getEmailSender().send(profile.email, mail.subject, mail.html);
        } catch (e) {
            // 메일 실패가 청구 자체를 되돌리지는 않는다. 인앱 알림은 이미 갔다.
            console.error("[extension] 메일 발송 실패:", e);
        }
    }

    await admin
        .from("payments")
        .update({ link_sent_at: new Date().toISOString() })
        .eq("id", issued.payment_id);
}

/** 소프트 상한을 넘은 건 — 관리자가 확인해야 링크가 나간다 */
async function notifyAdmins(
    params: Parameters<typeof issueExtensionCharge>[0],
    amount: number,
) {
    try {
        const admin = createAdminClient();
        const { data: admins } = await admin
            .from("profiles")
            .select("id")
            .eq("role", "ADMIN")
            .eq("status", "ACTIVE");

        await Promise.all(
            (admins ?? []).map((a) =>
                createNotification(a.id, {
                    type: "PAYMENT_ADDITIONAL",
                    title: "추가 결제 확인이 필요해요",
                    body: `예약 ${params.reservationCode} · ${amount.toLocaleString()}원. 총액이 기준을 넘어 링크를 보내지 않았습니다.`,
                    link: "/admin",
                }),
            ),
        );
    } catch (e) {
        console.error("[extension] 관리자 알림 실패:", e);
    }
}

/**
 * 추가결제 독촉 (#75) — 약관 제22조 ①.
 *
 *  기한이 지난 건은 토큰이 죽어 링크가 소용없다. 그런 건은 마이페이지로
 *  보낸다 — 거기서 다시 발급받아 결제할 수 있다. "내야 하는데 낼 수가 없는"
 *  상태를 만들지 않는 것이 이 분기의 목적이다.
 *
 *  실패해도 던지지 않는다. 배치가 한 건 때문에 멈추면 나머지도 못 나간다.
 *
 *  ⚠️ 발송 상한은 DB(`claim_extension_reminders`)가 쥐고 있다. 7회째면
 *     `handed_over` 가 실려 오고, 그 건은 **다음 배치부터 대상에서 빠진다.**
 *     마지막 안내에는 그 사실을 적어야 한다 — 계속 올 줄 알고 기다리는
 *     사람을 만들지 않기 위해서다(2026-09-05 리뷰).
 */
export async function sendExtensionReminder(target: {
    payment_id: string;
    customer_id: string;
    amount: number;
    code: string;
    use_date: string;
    pay_token: string | null;
    overdue: boolean;
    /** 이번이 마지막 자동 발송이라 관리자에게 넘어갔다 */
    handed_over?: boolean;
}): Promise<boolean> {
    try {
        const admin = createAdminClient();
        const payable = !target.overdue && !!target.pay_token;
        const link = payable ? `/pay/${target.pay_token}` : "/mypage";
        const amount = target.amount.toLocaleString();
        const last = target.handed_over === true;

        await createNotification(target.customer_id, {
            type: "PAYMENT_ADDITIONAL",
            title: last
                ? "미결제 건으로 곧 연락드릴게요"
                : target.overdue
                  ? "미결제 금액이 있어요"
                  : "추가 결제를 완료해 주세요",
            body: last
                ? `예약 ${target.code} · ${amount}원. 자동 안내는 여기까지이며, 담당자가 직접 연락드립니다.`
                : target.overdue
                  ? `예약 ${target.code} · ${amount}원이 결제되지 않았습니다. 결제 전에는 새 예약을 신청하실 수 없어요.`
                  : `예약 ${target.code} · ${amount}원이 아직 결제되지 않았습니다.`,
            link,
        });

        const { data: profile } = await admin
            .from("profiles")
            .select("email")
            .eq("id", target.customer_id)
            .maybeSingle();

        if (profile?.email) {
            const url = payable
                ? payUrl(target.pay_token!)
                : `${
                      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
                      "https://www.hamkegayo.kr"
                  }/mypage`;

            await getEmailSender().send(
                profile.email,
                `[함께가요] ${
                    last
                        ? "미결제 최종 안내"
                        : target.overdue
                          ? "미결제 안내"
                          : "추가 결제 안내"
                } · ${amount}원`,
                `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="margin:0 0 16px;color:#111827">${
          last
              ? "미결제 최종 안내입니다"
              : target.overdue
                ? "미결제 금액이 있습니다"
                : "추가 결제가 남아 있습니다"
      }</h2>
      <p style="margin:0 0 20px;color:#4b5563;line-height:1.6">
        ${target.use_date} 이용하신 병원동행 서비스(예약 ${target.code})의
        추가 요금이 아직 결제되지 않았습니다.
      </p>
      <div style="font-size:28px;font-weight:800;color:#2e9ce6;text-align:center;padding:18px 0;background:#f0f9ff;border-radius:12px">
        ${amount}원
      </div>
      <p style="margin:24px 0 0;text-align:center">
        <a href="${url}" style="display:inline-block;background:#2e9ce6;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:700">
          ${payable ? "결제하기" : "마이페이지에서 결제"}
        </a>
      </p>
      ${
          target.overdue
              ? `<p style="margin:20px 0 0;font-size:13px;color:#b91c1c;line-height:1.6">
                   결제가 완료될 때까지 새 예약을 신청하실 수 없습니다(이용약관 제22조 ③).
                 </p>`
              : ""
      }
      ${
          last
              ? `<p style="margin:20px 0 0;font-size:13px;color:#4b5563;line-height:1.6">
                   자동 안내 메일은 이번이 마지막입니다. 이후에는 고객센터에서
                   직접 연락드립니다 (010-9345-2328 · 06:00~18:00).
                   미납 금액과 이용 제한은 결제 완료 시까지 유지됩니다.
                 </p>`
              : ""
      }
      <p style="margin:20px 0 0;font-size:13px;color:#9ca3af;line-height:1.6">
        이 메일에는 이용자 정보가 담겨 있지 않습니다.
      </p>
    </div>`,
            );
        }
        return true;
    } catch (e) {
        console.error("[extension] 독촉 실패:", target.payment_id, e);
        return false;
    }
}

/**
 * 자동 독촉 상한에 걸린 건을 관리자에게 넘긴다 (#75 · 2026-09-05 리뷰).
 *
 *  DB 는 7회째에 `collection_state` 를 UNPAID_EXPIRED 로 바꾸고 대상에서
 *  뺀다. 그것만으로는 **아무도 모르는 채 회수가 멈춘다.** 여기서 사람에게
 *  알려 후속을 잇는다.
 *
 *  ⚠️ 알림에 예약번호와 금액까지만 넣는다. 이용자 이름·연락처는 관리자
 *     화면에서 권한으로 확인한다(처리방침 제5조 — 필요 최소 범위).
 */
export async function notifyCollectionHandover(
    handed: { code: string; amount: number }[],
): Promise<void> {
    if (handed.length === 0) return;

    try {
        const admin = createAdminClient();
        const { data: admins } = await admin
            .from("profiles")
            .select("id")
            .eq("role", "ADMIN")
            .eq("status", "ACTIVE");

        const total = handed.reduce((sum, h) => sum + h.amount, 0);
        const head = handed
            .slice(0, 3)
            .map((h) => h.code)
            .join(", ");
        const body =
            handed.length === 1
                ? `예약 ${head} · ${total.toLocaleString()}원. 자동 독촉 7회가 끝나 직접 연락이 필요합니다.`
                : `예약 ${head}${handed.length > 3 ? ` 외 ${handed.length - 3}건` : ""} · 합계 ${total.toLocaleString()}원. 자동 독촉이 끝나 직접 연락이 필요합니다.`;

        await Promise.all(
            (admins ?? []).map((a) =>
                createNotification(a.id, {
                    type: "PAYMENT_ADDITIONAL",
                    title: "미수 건이 관리자에게 이관되었어요",
                    body,
                    link: "/admin",
                }),
            ),
        );
    } catch (e) {
        console.error("[extension] 이관 알림 실패:", e);
    }
}
