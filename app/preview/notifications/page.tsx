import { notFound } from "next/navigation";
import { NotificationsScreen } from "@/components/notifications-screen";
import { isNotificationPreviewEnvironment } from "@/lib/preview-environment";
import {
  NOTIFICATION_PREVIEW_ITEMS,
  NOTIFICATION_PREVIEW_NOW,
} from "@/lib/preview-notifications-fixture";

export default function PreviewNotificationsPage() {
  if (!isNotificationPreviewEnvironment()) notFound();

  return (
    <NotificationsScreen
      initialNotifications={NOTIFICATION_PREVIEW_ITEMS}
      referenceNow={NOTIFICATION_PREVIEW_NOW}
      settingsHref="/preview/notifications/settings"
      backHref="/preview/notifications/home"
      initialPushState="subscribed"
    />
  );
}
