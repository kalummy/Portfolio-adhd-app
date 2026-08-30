export type PushSubscriptionInput = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type PushNotificationPayload = {
  notificationId: string;
  title: string;
  body: string;
  route: "/" | "/visits" | "/moods?tab=report";
};

function isBoundedString(value: unknown, minimum: number, maximum: number) {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum;
}

export function isPushSubscriptionInput(value: unknown): value is PushSubscriptionInput {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PushSubscriptionInput>;
  const endpoint = candidate.endpoint;
  if (!isBoundedString(endpoint, 16, 4096) || typeof endpoint !== "string") return false;
  if (!candidate.keys || typeof candidate.keys !== "object") return false;
  if (!isBoundedString(candidate.keys.p256dh, 16, 512)) return false;
  if (!isBoundedString(candidate.keys.auth, 8, 256)) return false;

  try {
    return new URL(endpoint).protocol === "https:";
  } catch {
    return false;
  }
}

export function isPushNotificationRoute(
  value: unknown,
): value is PushNotificationPayload["route"] {
  return value === "/" || value === "/visits" || value === "/moods?tab=report";
}
