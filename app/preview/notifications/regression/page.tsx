import { notFound } from "next/navigation";
import { NotificationsScreen } from "@/components/notifications-screen";
import { isNotificationPreviewEnvironment } from "@/lib/preview-environment";
import { NOTIFICATION_PREVIEW_ITEMS } from "@/lib/preview-notifications-fixture";

// Synthetic, read-only layout fixture: scroll, date boundaries and wrapping.
export default function NotificationRegressionPreviewPage() {
  if (!isNotificationPreviewEnvironment()) notFound();

  const referenceNow = "2026-09-15T05:00:00.000Z";
  const items = Array.from({ length: 24 }, (_, index) => ({
    ...NOTIFICATION_PREVIEW_ITEMS[index % NOTIFICATION_PREVIEW_ITEMS.length],
    id: `release-regression-${index}`,
    firedAt: new Date(Date.parse(referenceNow) - index * 86_400_000).toISOString(),
    title: index % 3 === 0 ? "두 줄 이상으로 표시되는 긴 알림 제목을 확인해주세요" : "회귀 QA 알림",
    body: index % 3 === 0
      ? "이 알림은 레이아웃 검증용 가상 데이터입니다. 본문이 여러 줄로 길어져도 다음 카드와 날짜 영역을 가리지 않는지 확인합니다."
      : "레이아웃 검증용 가상 알림이에요.",
  }));

  return (
    <NotificationsScreen
      initialNotifications={items}
      referenceNow={referenceNow}
      settingsHref="/preview/notifications/settings"
      backHref="/preview/notifications/home"
      initialPushState="subscribed"
    />
  );
}
