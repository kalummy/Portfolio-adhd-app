"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MobileShell } from "@/components/mobile-shell";
import {
  getCurrentPushSnapshot,
  getPushPermissionState,
  isPushUnavailableError,
  requestPushSubscription,
  updateCurrentPushPreference,
  type CurrentPushState,
} from "@/lib/push/client";
import type { PushPreferenceKind, PushPreferences } from "@/lib/push/contracts";
import {
  DISABLED_PUSH_PREFERENCES,
  rollbackPushPreference,
  setPushPreference,
} from "@/lib/push/preferences";

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

type PendingPreferences = Record<PushPreferenceKind, boolean>;

const NO_PENDING_PREFERENCES: PendingPreferences = {
  medication: false,
  visit_day: false,
  mood: false,
};

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
    initialState === "subscribed" ? ALL_ENABLED : DISABLED_PUSH_PREFERENCES,
  );
  const [pending, setPending] = useState<PendingPreferences>(NO_PENDING_PREFERENCES);
  const [error, setError] = useState("");
  const stateRef = useRef<PushSettingsState>(initialState ?? "checking");
  const preferencesRef = useRef<PushPreferences>(
    initialState === "subscribed" ? ALL_ENABLED : DISABLED_PUSH_PREFERENCES,
  );
  const pendingRef = useRef<PendingPreferences>(NO_PENDING_PREFERENCES);
  const refreshVersionRef = useRef(0);
  const activationRef = useRef<ReturnType<typeof requestPushSubscription> | null>(null);

  function applyState(nextState: PushSettingsState) {
    stateRef.current = nextState;
    setState(nextState);
  }

  function applyPreferences(nextPreferences: PushPreferences) {
    preferencesRef.current = nextPreferences;
    setPreferences(nextPreferences);
  }

  function applyPending(kind: PushPreferenceKind, isPending: boolean) {
    const nextPending = { ...pendingRef.current, [kind]: isPending };
    pendingRef.current = nextPending;
    setPending(nextPending);
  }

  useEffect(() => {
    if (isPreviewFixture) return;
    let active = true;

    async function refreshFromCurrentSubscription() {
      const refreshVersion = ++refreshVersionRef.current;
      try {
        const snapshot = await getCurrentPushSnapshot();
        if (!active || refreshVersion !== refreshVersionRef.current) return;
        applyState(snapshot.state);
        applyPreferences(snapshot.preferences ?? DISABLED_PUSH_PREFERENCES);
        setError("");
      } catch (error) {
        if (!active || refreshVersion !== refreshVersionRef.current) return;
        applyState(stateFromCurrentPermission());
        setError(isPushUnavailableError(error)
          ? "현재 환경에서는 알림을 사용할 수 없어요."
          : "알림 상태를 확인하지 못했어요. 다시 시도해주세요.");
      }
    }

    void refreshFromCurrentSubscription();

    function refreshWhenVisible() {
      if (document.visibilityState === "visible"
        && !Object.values(pendingRef.current).some(Boolean)) {
        void refreshFromCurrentSubscription();
      }
    }

    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      refreshVersionRef.current += 1;
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [isPreviewFixture]);

  async function handleToggle(kind: PushPreferenceKind) {
    const currentState = stateRef.current;
    if (pendingRef.current[kind] || currentState === "checking"
      || currentState === "denied" || currentState === "unsupported") return;
    const previousValue = preferencesRef.current[kind];
    const enabled = !previousValue;
    applyPreferences(setPushPreference(preferencesRef.current, kind, enabled));
    setError("");

    if (isPreviewFixture) {
      applyState("subscribed");
      return;
    }

    refreshVersionRef.current += 1;
    applyPending(kind, true);

    try {
      if (enabled && stateRef.current !== "subscribed") {
        const activation = activationRef.current ?? requestPushSubscription({
          startWithPreferencesDisabled: true,
        });
        activationRef.current = activation;
        let result: Awaited<typeof activation>;
        try {
          result = await activation;
        } finally {
          if (activationRef.current === activation) activationRef.current = null;
        }
        if (result.status !== "subscribed") {
          applyState(result.status);
          throw new Error("push_subscription_not_active");
        }
        applyState("subscribed");
      }

      await updateCurrentPushPreference(kind, enabled);
    } catch (error) {
      applyPreferences(rollbackPushPreference(
        preferencesRef.current,
        kind,
        enabled,
        previousValue,
      ));
      setError(isPushUnavailableError(error)
        ? "현재 환경에서는 알림을 사용할 수 없어요."
        : "알림 설정을 변경하지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      applyPending(kind, false);
    }
  }

  const stateDisablesControls = state === "checking" || state === "denied" || state === "unsupported";
  const hasPendingPreference = Object.values(pending).some(Boolean);

  return (
    <MobileShell className="notification-settings-screen">
      <header className="notifications-header notification-settings-header">
        <Link href={backHref} aria-label="이전 화면">
          <Image src="/icons/back.svg" alt="" width={18} height={14} />
        </Link>
        <h1>알림 설정</h1>
      </header>

      <section className="notification-settings-content" aria-busy={hasPendingPreference}>
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
                  disabled={stateDisablesControls || pending[item.kind]}
                  aria-busy={pending[item.kind]}
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
