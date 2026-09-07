import { notFound } from "next/navigation";
import { NotificationSettingsScreen } from "@/components/notification-settings-screen";
import { PushE2EButton } from "@/components/push-e2e-button";
import { isNotificationPreviewEnvironment } from "@/lib/preview-environment";

export const dynamic = "force-dynamic";

export default function PreviewPushE2EPage() {
  if (!isNotificationPreviewEnvironment()) notFound();
  return <NotificationSettingsScreen backHref="/preview/notifications" initialState="subscribed"
    e2eAction={<PushE2EButton previewOnly offer={{
      runId: "00000000-0000-4000-8000-000000000000",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }} />} />;
}
