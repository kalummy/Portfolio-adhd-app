const SAFE_ROUTES = [
  /^\/$/,
  /^\/\?date=\d{4}-\d{2}-\d{2}$/,
  /^\/visits$/,
  /^\/moods\?tab=report$/,
];

function safeRoute(value) {
  if (typeof value !== "string") return "/";
  return SAFE_ROUTES.some((pattern) => pattern.test(value)) ? value : "/";
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    return;
  }
  if (typeof payload.title !== "string" || typeof payload.body !== "string") return;

  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: "/icons/addi-app-icon-192.png",
    badge: "/icons/addi-app-icon-192.png",
    tag: typeof payload.tag === "string" ? payload.tag : undefined,
    renotify: false,
    data: {
      notificationId: typeof payload.notificationId === "string"
        ? payload.notificationId
        : null,
      route: safeRoute(payload.route),
    },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const notificationId = event.notification.data?.notificationId;
  const route = safeRoute(event.notification.data?.route);
  const url = new URL(route, self.location.origin).href;

  const markRead = typeof notificationId === "string"
    ? fetch("/api/notifications", {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notificationId }),
    }).catch(() => undefined)
    : Promise.resolve();

  const openApp = self.clients.matchAll({ type: "window", includeUncontrolled: true })
    .then(async (clientList) => {
      const client = clientList.find((candidate) => (
        new URL(candidate.url).origin === self.location.origin
      ));
      if (client) {
        if ("navigate" in client) await client.navigate(url);
        return client.focus();
      }
      return self.clients.openWindow(url);
    });

  event.waitUntil(Promise.allSettled([markRead, openApp]));
});
