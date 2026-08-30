import "server-only";

import webPush, { type PushSubscription } from "web-push";
import { notificationRouteIsSafe } from "@/lib/notifications/constants";

export type PushNotificationPayload = {
  id: string;
  title: string;
  body: string;
  route: string | null;
};

let configuredFor: string | null = null;

function getVapidConfiguration() {
  const subject = process.env.VAPID_SUBJECT?.trim();
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!subject || !publicKey || !privateKey) return null;
  if (!subject.startsWith("mailto:") && !subject.startsWith("https://")) return null;
  return { subject, publicKey, privateKey };
}

export function isWebPushConfigured() {
  return getVapidConfiguration() !== null;
}

function configureVapid() {
  const configuration = getVapidConfiguration();
  if (!configuration) throw new Error("web_push_not_configured");
  const fingerprint = `${configuration.subject}:${configuration.publicKey}`;
  if (configuredFor === fingerprint) return;
  webPush.setVapidDetails(
    configuration.subject,
    configuration.publicKey,
    configuration.privateKey,
  );
  configuredFor = fingerprint;
}

export async function sendNotificationPush(
  subscription: PushSubscription,
  notification: PushNotificationPayload,
) {
  configureVapid();
  const route = notificationRouteIsSafe(notification.route) ? notification.route : "/";
  return webPush.sendNotification(subscription, JSON.stringify({
    notificationId: notification.id,
    title: notification.title,
    body: notification.body,
    route,
    tag: `addi-notification-${notification.id}`,
  }), {
    TTL: 60 * 60,
    urgency: "normal",
  });
}

export function getWebPushStatusCode(error: unknown) {
  if (
    typeof error === "object"
    && error !== null
    && "statusCode" in error
    && typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }
  return null;
}
