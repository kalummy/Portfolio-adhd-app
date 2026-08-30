import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  VISIBLE_NOTIFICATION_KINDS,
  getNotificationCutoff,
  toAppNotification,
  type AppNotification,
  type AppNotificationRow,
} from "@/lib/notification-contract";

const APP_NOTIFICATION_COLUMNS = [
  "notification_id",
  "kind",
  "title",
  "body",
  "url",
  "fired_at",
  "read_at",
].join(",");

function visibleKinds() {
  return [...VISIBLE_NOTIFICATION_KINDS];
}

export async function listRecentNotifications(now = new Date()): Promise<AppNotification[]> {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase
    .from("app_notifications")
    .select(APP_NOTIFICATION_COLUMNS)
    .in("kind", visibleKinds())
    .gte("fired_at", getNotificationCutoff(now))
    .order("fired_at", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as unknown as AppNotificationRow[])
    .map(toAppNotification)
    .filter((notification): notification is AppNotification => notification !== null);
}

export async function hasUnreadNotifications(now = new Date()) {
  const supabase = createBrowserSupabaseClient();
  const { count, error } = await supabase
    .from("app_notifications")
    .select("notification_id", { count: "exact", head: true })
    .in("kind", visibleKinds())
    .gte("fired_at", getNotificationCutoff(now))
    .is("read_at", null);

  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function markNotificationRead(notificationId: string, readAt = new Date()) {
  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase
    .from("app_notifications")
    .update({ read_at: readAt.toISOString() })
    .eq("notification_id", notificationId)
    .is("read_at", null);

  if (error) throw error;
}

export async function markAllRecentNotificationsRead(now = new Date()) {
  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase
    .from("app_notifications")
    .update({ read_at: now.toISOString() })
    .in("kind", visibleKinds())
    .gte("fired_at", getNotificationCutoff(now))
    .is("read_at", null);

  if (error) throw error;
}
