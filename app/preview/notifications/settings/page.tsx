import { notFound } from "next/navigation";
import { NotificationSettingsScreen } from "@/components/notification-settings-screen";
import { isNotificationPreviewEnvironment } from "@/lib/preview-environment";

export default function PreviewNotificationSettingsPage() {
  if (!isNotificationPreviewEnvironment()) notFound();

  return (
    <NotificationSettingsScreen
      backHref="/preview/notifications"
      initialState="default"
    />
  );
}
