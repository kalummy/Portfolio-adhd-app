"use client";

import type {
  PushPreferenceKind,
  PushPreferences,
  PushSubscriptionInput,
} from "@/lib/push/contracts";

export type PushPermissionState = NotificationPermission | "unsupported";
export type CurrentPushState =
  | "unsupported"
  | "default"
  | "denied"
  | "granted-unsubscribed"
  | "subscribed";

export type CurrentPushSnapshot = {
  state: CurrentPushState;
  preferences: PushPreferences | null;
};

export class PushUnavailableError extends Error {
  constructor() {
    super("push_unavailable");
    this.name = "PushUnavailableError";
  }
}

export function isPushUnavailableError(error: unknown): error is PushUnavailableError {
  return error instanceof PushUnavailableError;
}

function assertPushResponse(response: Response, fallbackCode: string) {
  if (response.ok) return;
  if (response.status === 503) throw new PushUnavailableError();
  throw new Error(fallbackCode);
}

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

export async function getCurrentPushSubscription() {
  if (!browserSupportsPush()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration?.pushManager.getSubscription() ?? null;
}

type ServerSubscriptionStatus = {
  active: boolean;
  preferences: PushPreferences | null;
};

async function getServerSubscriptionStatus(subscription: PushSubscription): Promise<ServerSubscriptionStatus> {
  const response = await fetch("/api/push/subscriptions/status", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  assertPushResponse(response, "push_subscription_status_failed");

  const result = await response.json().catch(() => null) as {
    ok?: unknown;
    active?: unknown;
    preferences?: PushPreferences | null;
  } | null;
  if (result?.ok !== true) throw new Error("push_subscription_status_failed");
  return {
    active: result.active === true,
    preferences: result.preferences ?? null,
  };
}

export async function getCurrentPushState(): Promise<CurrentPushState> {
  return (await getCurrentPushSnapshot()).state;
}

export async function getCurrentPushSnapshot(): Promise<CurrentPushSnapshot> {
  const permission = getPushPermissionState();
  if (permission === "unsupported" || permission === "default" || permission === "denied") {
    return { state: permission, preferences: null };
  }

  const subscription = await getCurrentPushSubscription();
  if (!subscription) return { state: "granted-unsubscribed", preferences: null };
  const status = await getServerSubscriptionStatus(subscription);
  return status.active
    ? { state: "subscribed", preferences: status.preferences }
    : { state: "granted-unsubscribed", preferences: null };
}

export async function updateCurrentPushPreference(kind: PushPreferenceKind, enabled: boolean) {
  const subscription = await getCurrentPushSubscription();
  if (!subscription) throw new Error("push_subscription_missing");
  const response = await fetch("/api/push/subscriptions", {
    method: "PATCH",
    credentials: "same-origin",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint, kind, enabled }),
  });
  assertPushResponse(response, "push_preference_update_failed");
}

async function saveSubscription(subscription: PushSubscription, startWithPreferencesDisabled: boolean) {
  const json = subscription.toJSON();
  const input: PushSubscriptionInput = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
    },
    ...(startWithPreferencesDisabled ? { startWithPreferencesDisabled: true } : {}),
  };

  const response = await fetch("/api/push/subscriptions", {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  assertPushResponse(response, "push_subscription_save_failed");
}

export async function requestPushSubscription(options?: { startWithPreferencesDisabled?: boolean }) {
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
  let createdSubscription = false;
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicVapidKey()),
    });
    createdSubscription = true;
  }

  try {
    await saveSubscription(subscription, options?.startWithPreferencesDisabled === true);
  } catch (error) {
    if (createdSubscription) await subscription.unsubscribe().catch(() => false);
    throw error;
  }
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
  });

  assertPushResponse(response, "push_subscription_revoke_failed");
  const unsubscribed = await subscription.unsubscribe();
  if (!unsubscribed) throw new Error("push_subscription_unsubscribe_failed");
}
