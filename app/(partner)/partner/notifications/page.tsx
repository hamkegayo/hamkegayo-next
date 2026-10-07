import { getMyNotifications } from "@/lib/notifications";
import { NotificationsView } from "@/components/notifications-view";
import { NotificationSettings } from "../../_components/notification-settings";
import { getMyNotificationPrefs } from "../_actions/notification-prefs";

export default async function PartnerNotifications() {
    const [notifications, prefs] = await Promise.all([
        getMyNotifications(),
        getMyNotificationPrefs(),
    ]);
    return (
        <>
            {/* 알림 설정 (#255-4) — 요청 상세의 "알림 설정" 버튼이 여기로 온다 */}
            <NotificationSettings
                initialEmail={prefs?.emailNewRequest ?? true}
            />
            <NotificationsView notifications={notifications} />
        </>
    );
}
