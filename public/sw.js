const SAFE_NOTIFICATION_ROUTES = new Set(["/", "/visits", "/moods?tab=report"]);

function safeNotificationRoute(value) {
  return typeof value === "string" && SAFE_NOTIFICATION_ROUTES.has(value) ? value : "/";
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = {};
  }

  const title = typeof payload.title === "string" ? payload.title : "ADDI 알림";
  const body = typeof payload.body === "string" ? payload.body : "새 알림이 도착했어요.";
  const notificationId = typeof payload.notificationId === "string"
    ? payload.notificationId
    : null;
  const route = safeNotificationRoute(payload.route);

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/icon.png",
    badge: "/icon.png",
    tag: notificationId ?? undefined,
    data: { notificationId, route },
  }));
});

async function openNotificationRoute(route) {
  const targetUrl = new URL(route, self.location.origin).href;
  const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const existingClient = windowClients.find((client) => client.url === targetUrl);
  if (existingClient) return existingClient.focus();
  return self.clients.openWindow(targetUrl);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const notificationId = event.notification.data?.notificationId;
  const route = safeNotificationRoute(event.notification.data?.route);

  event.waitUntil((async () => {
    if (typeof notificationId === "string") {
      await fetch("/api/notifications/read", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId }),
      }).catch(() => undefined);
    }
    await openNotificationRoute(route);
  })());
});
