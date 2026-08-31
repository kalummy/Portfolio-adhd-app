import "server-only";

import webpush from "web-push";
import type { PushNotificationPayload, PushSubscriptionInput } from "@/lib/push/contracts";

export const WEB_PUSH_TIMEOUT_MS = 5_000;

export class WebPushConfigurationError extends Error {
  constructor() {
    super("web_push_not_configured");
    this.name = "WebPushConfigurationError";
  }
}

export function assertWebPushConfigured() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) throw new WebPushConfigurationError();
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export async function sendWebPush(
  subscription: PushSubscriptionInput,
  payload: PushNotificationPayload,
) {
  assertWebPushConfigured();
  return webpush.sendNotification(subscription, JSON.stringify(payload), {
    TTL: 60,
    urgency: "normal",
    timeout: WEB_PUSH_TIMEOUT_MS,
  });
}

export function isExpiredPushSubscriptionError(error: unknown) {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return false;
  return error.statusCode === 404 || error.statusCode === 410;
}
