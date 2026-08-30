import { notFound } from "next/navigation";
import { NotificationsScreen } from "@/components/notifications-screen";
import { isNotificationPreviewEnvironment } from "@/lib/preview-environment";

export default function PreviewNotificationsEmptyPage() {
  if (!isNotificationPreviewEnvironment()) notFound();

  return (
    <NotificationsScreen
      initialNotifications={[]}
      settingsHref="/preview/notifications/settings"
      initialPushState="subscribed"
    />
  );
}
