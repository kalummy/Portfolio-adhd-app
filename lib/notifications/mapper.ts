import type { NotificationRecord, NotificationType } from "./constants";

type NotificationRow = {
  id: string;
  notification_type: NotificationType;
  title: string;
  body: string;
  route: string | null;
  local_date: string | null;
  reminder_slot: NotificationRecord["reminderSlot"];
  read_at: string | null;
  created_at: string;
};

export const NOTIFICATION_COLUMNS = [
  "id",
  "notification_type",
  "title",
  "body",
  "route",
  "local_date",
  "reminder_slot",
  "read_at",
  "created_at",
].join(",");

export function fromNotificationRow(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    notificationType: row.notification_type,
    title: row.title,
    body: row.body,
    route: row.route,
    localDate: row.local_date,
    reminderSlot: row.reminder_slot,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}
