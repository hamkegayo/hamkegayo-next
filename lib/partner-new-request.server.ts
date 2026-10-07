import { createAdminClient } from "@/utils/supabase/admin";
import { getEmailSender } from "@/lib/email";
import { isPublicHoliday } from "@/lib/holidays";
import { formatUseDate, toHhmm } from "@/lib/format";

type DayKind = "WEEKDAY" | "SATURDAY" | "HOLIDAY";

/** 파트너 활동 시간 구분(평일 / 토요일 / 일요일·공휴일)과 같은 기준 */
async function dayKindOf(useDate: string): Promise<DayKind> {
    if (await isPublicHoliday(useDate)) return "HOLIDAY";
    const day = new Date(`${useDate}T00:00:00Z`).getUTCDay();
    if (day === 0) return "HOLIDAY";
    if (day === 6) return "SATURDAY";
    return "WEEKDAY";
}

/** 병원 주소의 시·도 + 시·군·구까지만. 상세 주소는 알림에 넣지 않는다. */
function areaOf(address: string): string {
    return address.trim().split(/\s+/).slice(0, 2).join(" ");
}

function siteBase(): string {
    return (
        process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
        "https://www.hamkegayo.kr"
    );
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/**
 * 새 매칭 요청을 활동 지역·가능 시간이 맞는 파트너에게 알린다 (#255-4).
 * 대상 판정·인앱 알림·중복 방지는 DB 함수 notify_partners_new_request 가 하고,
 * 여기서는 요일 구분을 넘기고 이메일 수신 파트너에게 메일을 보낸다.
 * 문구에는 이용자 개인정보를 넣지 않는다 — 일시·상품·병원 시·군·구만(단계 1 목록 수준).
 * 예약 신청 응답을 막지 않도록 after() 에서 부른다. 실패는 기록만 하고 삼킨다.
 */
export async function notifyPartnersOfNewRequest(input: {
    reservationId: string;
    useDate: string;
    arriveTime: string;
    plan: string;
    hospitalAddress: string;
}): Promise<void> {
    try {
        const dayKind = await dayKindOf(input.useDate);
        const planLabel = input.plan === "plus" ? "Plus" : "Basic";
        const area = areaOf(input.hospitalAddress);
        const when = `${formatUseDate(input.useDate)} ${toHhmm(input.arriveTime)}`;
        const title = "새 동행 요청이 도착했어요";
        const body = `${when} · ${planLabel} · ${area}`;

        const { data, error } = await createAdminClient().rpc(
            "notify_partners_new_request",
            {
                p_reservation: input.reservationId,
                p_day_kind: dayKind,
                p_title: title,
                p_body: body,
            },
        );
        if (error) {
            console.error("[new-request] 알림 대상 계산 실패:", error.message);
            return;
        }

        const recipients = (data ?? []) as {
            partner_id: string;
            email: string;
        }[];
        if (recipients.length === 0) return;

        const link = `${siteBase()}/partner/requests/${input.reservationId}`;
        const html = `
<p>활동 지역·시간에 맞는 새 병원동행 요청이 도착했어요.</p>
<p><strong>${escapeHtml(body)}</strong></p>
<p><a href="${link}">요청 확인하기</a></p>
<p style="color:#888;font-size:12px">알림 메일은 파트너 화면의 알림 &gt; 알림 설정에서 끌 수 있어요.</p>`;

        const sender = getEmailSender();
        await Promise.all(
            recipients.map((r) =>
                sender
                    .send(r.email, `[함께가요] ${title}`, html)
                    .catch((e: unknown) =>
                        console.error(
                            "[new-request] 메일 발송 실패:",
                            e instanceof Error ? e.message : e,
                        ),
                    ),
            ),
        );
    } catch (e) {
        console.error("[new-request] 알림 처리 실패:", e);
    }
}
