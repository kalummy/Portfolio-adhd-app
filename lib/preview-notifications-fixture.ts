import type { AppNotification } from "@/lib/notification-contract";

export const NOTIFICATION_PREVIEW_NOW = "2026-08-30T05:00:00.000Z";

export const NOTIFICATION_PREVIEW_ITEMS: AppNotification[] = [
  {
    id: "preview-medication-unread",
    kind: "medication",
    title: "복용 알림",
    body: "오늘 복용기록이 없어요.",
    targetUrl: "/",
    firedAt: "2026-08-30T04:59:00.000Z",
    readAt: null,
  },
  {
    id: "preview-visit-read",
    kind: "visit_day",
    title: "내원 알림",
    body: "오늘은 내원일이에요.",
    targetUrl: "/visits",
    firedAt: "2026-08-30T00:00:00.000Z",
    readAt: "2026-08-30T00:05:00.000Z",
  },
  {
    id: "preview-mood-read",
    kind: "mood",
    title: "감정기록 알림",
    body: "지금 리포트 결과를 확인해보세요.",
    targetUrl: "/moods?tab=report",
    firedAt: "2026-06-03T15:00:00.000Z",
    readAt: "2026-06-04T00:00:00.000Z",
  },
];
