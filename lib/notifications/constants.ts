export const NOTIFICATION_RETENTION_DAYS = 90;
export const NOTIFICATION_TIME_ZONE = "Asia/Seoul";
export const MEDICATION_REMINDER_SLOTS = ["10:00", "13:00", "16:00", "22:00"] as const;

export type MedicationReminderSlot = (typeof MEDICATION_REMINDER_SLOTS)[number];
export type NotificationType =
  | "medication_reminder"
  | "visit_reminder"
  | "mood_reminder"
  | "announcement";

export type VisibleNotificationType = Exclude<NotificationType, "announcement">;

export type NotificationRecord = {
  id: string;
  notificationType: NotificationType;
  title: string;
  body: string;
  route: string | null;
  localDate: string | null;
  reminderSlot: MedicationReminderSlot | null;
  readAt: string | null;
  createdAt: string;
};

export const NOTIFICATION_CONTENT = {
  medication_reminder: {
    title: "복용 알림",
    body: "오늘 복용기록이 없어요.",
  },
  visit_reminder: {
    title: "내원 알림",
    body: "오늘은 내원일이에요.",
  },
  mood_reminder: {
    title: "감정기록 알림",
    body: "지금 리포트 결과를 확인해보세요.",
  },
} as const;

export function isMedicationReminderSlot(value: string): value is MedicationReminderSlot {
  return MEDICATION_REMINDER_SLOTS.includes(value as MedicationReminderSlot);
}

export function isVisibleNotificationType(value: string): value is VisibleNotificationType {
  return value === "medication_reminder"
    || value === "visit_reminder"
    || value === "mood_reminder";
}

export function notificationRouteIsSafe(route: string | null): route is string {
  if (!route) return false;
  return route === "/"
    || /^\/\?date=\d{4}-\d{2}-\d{2}$/.test(route)
    || route === "/visits"
    || route === "/moods?tab=report";
}
