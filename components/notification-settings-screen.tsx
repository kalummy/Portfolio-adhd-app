"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MobileShell } from "@/components/mobile-shell";
import {
  getCurrentPushPreferences,
  getCurrentPushState,
  getPushPermissionState,
  isPushUnavailableError,
  requestPushSubscription,
  unsubscribeFromPush,
  updateCurrentPushPreference,
  type CurrentPushState,
} from "@/lib/push/client";
import type { PushPreferenceKind, PushPreferences } from "@/lib/push/contracts";

type PushSettingsState = "checking" | CurrentPushState;

type NotificationSettingsScreenProps = {
  backHref?: string;
  initialState?: PushSettingsState;
};

const SETTING_ITEMS: Array<{
  kind: PushPreferenceKind;
  title: string;
  description: string;
}> = [
  { kind: "medication", title: "복용 알림", description: "복용 시간을 놓치지 않도록 알려드려요" },
  { kind: "visit_day", title: "내원일 알림", description: "다가오는 내원일을 미리 알려드려요" },
  { kind: "mood", title: "감정기록 알림", description: "오늘의 감정을 기록할 때 알려드려요" },
];

const ALL_ENABLED: PushPreferences = { medication: true, visit_day: true, mood: true };
const ALL_DISABLED: PushPreferences = { medication: false, visit_day: false, mood: false };

function stateFromCurrentPermission(): CurrentPushState {
  const permission = getPushPermissionState();
  return permission === "granted" ? "granted-unsubscribed" : permission;
}

export function NotificationSettingsScreen({
  backHref = "/notifications",
  initialState,
}: NotificationSettingsScreenProps = {}) {
  const isPreviewFixture = initialState !== undefined;
  const [state, setState] = useState<PushSettingsState>(initialState ?? "checking");
  const [preferences, setPreferences] = useState<PushPreferences>(
    initialState === "subscribed" ? ALL_ENABLED : ALL_DISABLED,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refreshState = useCallback(async () => {
    try {
      const nextState = await getCurrentPushState();
      setState(nextState);
      setPreferences(nextState === "subscribed"
        ? await getCurrentPushPreferences() ?? ALL_ENABLED
        : ALL_DISABLED);
      setError("");
    } catch (error) {
      setState(stateFromCurrentPermission());
      setError(isPushUnavailableError(error)
        ? "현재 환경에서는 알림을 사용할 수 없어요."
        : "알림 상태를 확인하지 못했어요. 다시 시도해주세요.");
    }
  }, []);

  useEffect(() => {
    if (isPreviewFixture) return;
    let active = true;

    void getCurrentPushState()
      .then(async (nextState) => {
        if (!active) return;
        setState(nextState);
        setPreferences(nextState === "subscribed"
          ? await getCurrentPushPreferences() ?? ALL_ENABLED
          : ALL_DISABLED);
        setError("");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState(stateFromCurrentPermission());
        setError(isPushUnavailableError(error)
          ? "현재 환경에서는 알림을 사용할 수 없어요."
          : "알림 상태를 확인하지 못했어요. 다시 시도해주세요.");
      });

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") void refreshState();
    }

    window.addEventListener("focus", refreshState);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshState);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [isPreviewFixture, refreshState]);

  async function handleToggle(kind: PushPreferenceKind) {
    if (busy || state === "checking" || state === "denied" || state === "unsupported") return;
    const enabled = !preferences[kind];
    if (isPreviewFixture) {
      const nextPreferences = { ...preferences, [kind]: enabled };
      setPreferences(nextPreferences);
      setState(Object.values(nextPreferences).some(Boolean) ? "subscribed" : "granted-unsubscribed");
      return;
    }
    setBusy(true);
    setError("");

    try {
      const activatedSubscription = enabled && state !== "subscribed";
      if (enabled && state !== "subscribed") {
        const result = await requestPushSubscription();
        if (result.status !== "subscribed") {
          setState(result.status);
          setPreferences(ALL_DISABLED);
          return;
        }
        setState("subscribed");
      }

      if (activatedSubscription) {
        await Promise.all(
          SETTING_ITEMS.map((item) => updateCurrentPushPreference(item.kind, item.kind === kind)),
        );
      } else {
        await updateCurrentPushPreference(kind, enabled);
      }
      const serverPreferences = await getCurrentPushPreferences();
      const nextPreferences = serverPreferences ?? { ...preferences, [kind]: enabled };
      setPreferences(nextPreferences);

      if (!Object.values(nextPreferences).some(Boolean)) {
        await unsubscribeFromPush();
        setState("granted-unsubscribed");
      }
    } catch (error) {
      setState(getPushPermissionState() === "granted" ? state : stateFromCurrentPermission());
      setError(isPushUnavailableError(error)
        ? "현재 환경에서는 알림을 사용할 수 없어요."
        : "알림 설정을 변경하지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  const controlsDisabled = busy || state === "checking" || state === "denied" || state === "unsupported";

  return (
    <MobileShell className="notification-settings-screen">
      <header className="notifications-header notification-settings-header">
        <Link href={backHref} aria-label="이전 화면">
          <Image src="/icons/back.svg" alt="" width={18} height={14} />
        </Link>
        <h1>알림 설정</h1>
      </header>

      <section className="notification-settings-content" aria-busy={busy}>
        <p className="sr-only" aria-live="polite">
          {state === "checking" ? "알림 상태를 확인하고 있어요." : ""}
        </p>
        <div className="notification-settings-list">
          {SETTING_ITEMS.map((item, index) => (
            <div key={item.kind} className="notification-settings-item-group">
              {index > 0 ? <div className="notification-settings-divider" /> : null}
              <div className="notification-settings-item">
                <span className="notification-settings-item-copy">
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </span>
                <button
                  type="button"
                  className="notification-settings-toggle"
                  role="switch"
                  aria-checked={preferences[item.kind]}
                  aria-label={`${item.title} ${preferences[item.kind] ? "끄기" : "켜기"}`}
                  onClick={() => void handleToggle(item.kind)}
                  disabled={controlsDisabled}
                  aria-busy={busy}
                >
                  {preferences[item.kind] ? (
                    <span className="notification-settings-toggle-visual on" aria-hidden="true">
                      <Image src="/icons/notification-toggle-on-track.svg" alt="" width={62} height={32} />
                      <Image src="/icons/notification-toggle-on-thumb.svg" alt="" width={44} height={44} />
                    </span>
                  ) : (
                    <span className="notification-settings-toggle-visual off" aria-hidden="true">
                      <Image src="/icons/notification-toggle-off.svg" alt="" width={68} height={44} />
                    </span>
                  )}
                </button>
              </div>
            </div>
          ))}
          {error ? <p className="notification-settings-error" role="alert">{error}</p> : null}
        </div>
      </section>
    </MobileShell>
  );
}
