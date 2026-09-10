import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { kstDateDot } from "@/lib/format";

export type NotificationType =
    | "PARTNER_APPLIED"
    | "RESERVATION_CONFIRMED"
    | "RESERVATION_CANCELLED"
    | "PARTNER_ARRIVED"
    | "SERVICE_COMPLETED"
    | "PAYMENT_ADDITIONAL"
    | "PAYMENT_REFUND"
    | "PAYMENT_EXPIRED"
    | "REPORT_READY"
    /** 약관·방침이 개정되어 재동의가 필요하다 (#91) */
    | "AGREEMENT_REVISED";

export type NotificationView = {
    id: string;
    type: string;
    title: string;
    body: string | null;
    link: string | null;
    isRead: boolean;
    timeLabel: string;
};

function timeAgo(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.max(0, now.getTime() - d.getTime());
    const min = Math.floor(diff / 60000);
    if (min < 1) return "방금 전";
    if (min < 60) return `${min}분 전`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}시간 전`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}일 전`;
    return kstDateDot(d) ?? "";
}

/**
 * 알림 생성 — 수신자(recipient)는 행위자와 다르므로 service_role(admin)로 insert.
 * 서버 액션 내부에서만 호출한다(실패해도 본 작업은 진행되도록 throw 하지 않음).
 *
 *  `dedupeKey` 를 주면 같은 수신자에게 두 번 들어가지 않는다.
 *  예약 확정처럼 **사건**이 일어난 순간 부르는 알림은 키가 필요 없지만,
 *  재동의 안내처럼 **상태**가 유지되는 알림은 배치가 돌 때마다 쌓인다(#91).
 */
export async function createNotification(
    recipientId: string,
    n: {
        type: NotificationType;
        title: string;
        body?: string;
        link?: string;
        /** 상태형 알림의 중복 방지 키. 같은 수신자·같은 키는 한 번만 들어간다 */
        dedupeKey?: string;
    },
): Promise<void> {
    try {
        const admin = createAdminClient();
        const row = {
            recipient_id: recipientId,
            type: n.type,
            title: n.title,
            body: n.body ?? null,
            link: n.link ?? null,
            dedupe_key: n.dedupeKey ?? null,
        };

        if (n.dedupeKey) {
            // 부분 유니크 인덱스에 걸리면 조용히 넘어간다 — 이미 보낸 것이다.
            await admin.from("notifications").upsert(row, {
                onConflict: "recipient_id,dedupe_key",
                ignoreDuplicates: true,
            });
            return;
        }

        await admin.from("notifications").insert(row);
    } catch {
        // 알림 실패는 무시(본 작업 성공을 막지 않음)
    }
}

/** 로그인 사용자의 알림 목록 (최신순) */
export async function getMyNotifications(): Promise<NotificationView[]> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabase
            .from("notifications")
            .select("id, type, title, body, link, is_read, created_at")
            .eq("recipient_id", user.id)
            .order("created_at", { ascending: false })
            .limit(50);

        if (error || !data) return [];
        return data.map((r) => ({
            id: r.id,
            type: r.type,
            title: r.title,
            body: r.body,
            link: r.link,
            isRead: r.is_read,
            timeLabel: timeAgo(r.created_at),
        }));
    } catch {
        return [];
    }
}

/** 안 읽은 알림 수 */
export async function getUnreadCount(): Promise<number> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return 0;

        const { count } = await supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("recipient_id", user.id)
            .eq("is_read", false);

        return count ?? 0;
    } catch {
        return 0;
    }
}
