import { getMyNotifications } from "@/lib/notifications";
import { NotificationsView } from "@/components/notifications-view";

export default async function PartnerNotifications() {
    const notifications = await getMyNotifications();
    return <NotificationsView notifications={notifications} />;
}
