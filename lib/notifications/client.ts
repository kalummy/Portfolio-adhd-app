import type { VisibleNotificationType } from "./constants";

export function requestNotificationDispatch(
  notificationType: Extract<VisibleNotificationType, "visit_reminder" | "mood_reminder">,
  localDate: string,
) {
  return fetch("/api/notifications/dispatch", {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ notificationType, localDate }),
  });
}
