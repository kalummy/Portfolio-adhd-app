import { notFound } from "next/navigation";
import { NotificationsScreen } from "@/components/notifications-screen";
import { isNotificationPreviewEnvironment } from "@/lib/preview-environment";

export default function PreviewNotificationsOffPage() {
  if (!isNotificationPreviewEnvironment()) notFound();

  return (
    <NotificationsScreen
      initialNotifications={[]}
      initialPushState="default"
      settingsHref="/preview/notifications/settings"
    />
  );
}
