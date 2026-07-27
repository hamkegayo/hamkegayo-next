import { getMyNotifications } from "@/lib/notifications";
import { NotificationsView } from "@/components/notifications-view";

export default async function MypageNotifications() {
    const notifications = await getMyNotifications();
    return <NotificationsView notifications={notifications} />;
}
