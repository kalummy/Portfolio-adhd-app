"use client";

import type { PushSubscriptionInput } from "@/lib/push/contracts";

export type PushPermissionState = NotificationPermission | "unsupported";

function publicVapidKey() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (!key) throw new Error("vapid_public_key_missing");
  return key;
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = window.atob(base64);
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

function browserSupportsPush() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function getPushPermissionState(): PushPermissionState {
  if (typeof window === "undefined" || !browserSupportsPush()) return "unsupported";
  return Notification.permission;
}

export async function ensurePushServiceWorkerRegistration() {
  if (!browserSupportsPush()) throw new Error("push_unsupported");
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

async function saveSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const input: PushSubscriptionInput = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
    },
  };

  const response = await fetch("/api/push/subscriptions", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("push_subscription_save_failed");
}

export async function requestPushSubscription() {
  if (!browserSupportsPush()) return { status: "unsupported" as const };
  if (navigator.userActivation && !navigator.userActivation.isActive) {
    throw new Error("user_gesture_required");
  }

  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission === "denied") return { status: "denied" as const };
  if (permission !== "granted") return { status: "default" as const };

  const registration = await ensurePushServiceWorkerRegistration();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicVapidKey()),
    });
  }

  await saveSubscription(subscription);
  return { status: "subscribed" as const };
}

export async function unsubscribeFromPush() {
  if (!browserSupportsPush()) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  const response = await fetch("/api/push/subscriptions", {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => null);

  await subscription.unsubscribe();
  if (!response?.ok) throw new Error("push_subscription_revoke_failed");
}
