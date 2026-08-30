import { notFound } from "next/navigation";
import { HomeScreen } from "@/components/home-screen";
import {
  PREVIEW_HOME_DATA,
  PREVIEW_REFERENCE_DATE,
} from "@/lib/preview-home-fixture";
import { isNotificationPreviewEnvironment } from "@/lib/preview-environment";

export default function PreviewNotificationsHomePage() {
  if (!isNotificationPreviewEnvironment()) notFound();

  return (
    <HomeScreen
      previewData={PREVIEW_HOME_DATA}
      previewGreeting="아디님 안녕하세요"
      previewNotificationHref="/preview/notifications"
      previewHasUnreadNotifications
      referenceDateKey={PREVIEW_REFERENCE_DATE}
      initialDateKey={PREVIEW_REFERENCE_DATE}
    />
  );
}
