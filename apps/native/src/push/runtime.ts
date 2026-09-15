import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import {
  DEV_SUPABASE,
  DISABLED,
  allowedRoute,
  sha256,
  type Preferences,
  type PreferenceKind,
} from "../../../../lib/native-push/contracts";
import { getNativeClient } from "../auth/client";
import { getNativeAuthSnapshot, subscribeNativeAuth } from "../auth/runtime";
import { pushBridge, waitForTokenDeletion, type PushState } from "./bridge";
import { router } from "../platform/router";
export type CurrentPushState =
  | "unsupported"
  | "default"
  | "denied"
  | "granted-unsubscribed"
  | "subscribed";
export type CurrentPushSnapshot = {
  state: CurrentPushState;
  preferences: Preferences | null;
};
export class PushUnavailableError extends Error {
  constructor() {
    super("native_push_unavailable");
  }
}
export const isPushUnavailableError = (error: unknown) =>
  error instanceof PushUnavailableError;
let permission: NotificationPermission | "unsupported" = "default";
let started: Promise<void> | undefined;
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>) => {
  const result = queue.then(fn, fn);
  queue = result.catch(() => undefined);
  return result;
};
export const getPushPermissionState = () => permission;
const identity = (s: PushState) => ({
  installationId: s.installationId,
  secret: s.secret,
  revision: s.revision,
});
async function user() {
  const state = getNativeAuthSnapshot();
  if (state.status !== "signed_in" || !state.user)
    throw new PushUnavailableError();
  return state.user.id;
}
async function post(path: string, body: unknown) {
  const owner = await user();
  const { data, error } = await getNativeClient().auth.getSession();
  if (error || !data.session || data.session.user.id !== owner)
    throw new PushUnavailableError();
  const response = await fetch(
    `${DEV_SUPABASE}/functions/v1/native-push/${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) throw new PushUnavailableError();
  if ((await user()) !== owner) throw new PushUnavailableError();
  return response.json();
}
async function refreshPermission() {
  if (Capacitor.getPlatform() !== "android") {
    permission = "unsupported";
    return;
  }
  const p = await PushNotifications.checkPermissions();
  permission =
    p.receive === "granted"
      ? "granted"
      : p.receive === "denied"
        ? "denied"
        : "default";
}
let tokenResolve: (() => void) | undefined;
async function obtainToken() {
  await waitForTokenDeletion();
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      tokenResolve = undefined;
      reject(new PushUnavailableError());
    }, 15000);
    tokenResolve = () => {
      clearTimeout(timeout);
      tokenResolve = undefined;
      resolve();
    };
    void PushNotifications.register().catch(() => {
      clearTimeout(timeout);
      tokenResolve = undefined;
      reject(new PushUnavailableError());
    });
  });
}
async function registerCurrent(preferences?: Preferences) {
  const owner = await user();
  const state = await pushBridge.prepare({
    owner: await sha256(owner),
    preferences,
  });
  // Native prepare resets all preferences on ownership change; never inherit Web settings.
  if (!state.token) throw new PushUnavailableError();
  const info = await App.getInfo();
  await post("register", {
    ...identity(state),
    bindingId: state.bindingId,
    token: state.token,
    preferences: state.preferences,
    appVersion: info.version,
  });
  if ((await user()) === owner) {
    const ack = await pushBridge.acknowledge({
      revision: state.revision,
      bindingId: state.bindingId,
    });
    if (!ack.accepted) throw new PushUnavailableError();
  }
}
async function tap() {
  if (getNativeAuthSnapshot().status !== "signed_in") return;
  const state = await pushBridge.snapshot();
  if (state.owner !== (await sha256(await user()))) return;
  const { route } = await pushBridge.takeTap();
  if (allowedRoute(route)) router.push(route);
}
export function startNativePush() {
  return (started ??= (async () => {
    await refreshPermission();
    if (permission === "unsupported") return;
    await PushNotifications.addListener("registration", ({ value }) => {
      void pushBridge
        .storeToken({ token: value })
        .then(() => {
          if (tokenResolve) tokenResolve();
          else if (getNativeAuthSnapshot().status === "signed_in")
            void serial(() => registerCurrent()).catch(() => undefined);
        })
        .catch(() => undefined);
    });
    await PushNotifications.addListener("registrationError", () => {
      /* API/UI reports a generic retryable setup error. No raw provider diagnostics. */
    });
    await pushBridge.addListener("tap", () => {
      void tap().catch(() => undefined);
    });
    const resume = () => {
      if (getNativeAuthSnapshot().status === "signed_in")
        void serial(async () => {
          await refreshPermission();
          if (permission === "granted") {
            await obtainToken();
            await registerCurrent();
          } else {
            const s = await pushBridge.snapshot();
            if (s.active) await pushBridge.clearBinding();
          }
          await tap();
        }).catch(() => undefined);
    };
    let prior = "";
    subscribeNativeAuth(() => {
      const s = getNativeAuthSnapshot();
      const current = s.status === "signed_in" ? (s.user?.id ?? "") : "";
      if (current !== prior) {
        prior = current;
        if (current) resume();
        else void pushBridge.clearBinding().catch(() => undefined);
      } else if (s.status === "signed_out" || s.status === "unavailable")
        void pushBridge.clearBinding().catch(() => undefined);
    });
    await App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) resume();
    });
    resume();
  })().catch(() => {
    permission = "unsupported";
  }));
}
export async function getCurrentPushSnapshot(): Promise<CurrentPushSnapshot> {
  await startNativePush();
  await refreshPermission();
  if (permission !== "granted") return { state: permission, preferences: null };
  const s = await pushBridge.snapshot();
  const result = await post("status", identity(s));
  return {
    state: result.active ? "subscribed" : "granted-unsubscribed",
    preferences: result.preferences ?? DISABLED,
  };
}
export async function getCurrentPushState() {
  return (await getCurrentPushSnapshot()).state;
}
export async function requestPushSubscription(): Promise<{
  status: "subscribed" | "denied";
}> {
  await startNativePush();
  return serial(async () => {
    const p = await PushNotifications.requestPermissions();
    await refreshPermission();
    if (p.receive !== "granted") return { status: "denied" as const };
    await obtainToken();
    await registerCurrent();
    return { status: "subscribed" as const };
  });
}
export async function updateCurrentPushPreference(
  kind: PreferenceKind,
  enabled: boolean,
  _requestId?: string,
): Promise<Preferences> {
  return serial(async () => {
    const s = await pushBridge.snapshot();
    const prefs = { ...s.preferences, [kind]: enabled };
    await registerCurrent(prefs);
    return (await pushBridge.snapshot()).preferences;
  });
}
export async function unsubscribeFromPush() {
  await pushBridge.clearBinding();
  await pushBridge.deleteToken();
}
export async function sendNativeQa(kind: "daily" | "mood" | "visit_day_today") {
  const s = await pushBridge.snapshot();
  return post("test", { ...identity(s), requestId: crypto.randomUUID(), kind });
}
