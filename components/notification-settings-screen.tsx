"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MobileShell } from "@/components/mobile-shell";
import { Toast } from "@/components/toast";
import {
  navigateBackOrReplace,
  registerNotificationBackEntry,
} from "@/lib/navigation-history";
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
  cachePushPreferences,
  DISABLED_PUSH_PREFERENCES,
  getCachedPushPreferences,
  INITIAL_PUSH_PREFERENCE_VERSIONS,
  mergePushPreferenceSnapshot,
  rollbackPushPreference,
  setPushPreference,
  type PushPreferenceVersions,
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
type PreferenceWorkers = Record<PushPreferenceKind, Promise<void> | null>;

const NO_PENDING_PREFERENCES: PendingPreferences = {
  medication: false,
  visit_day: false,
  mood: false,
};

const NO_PREFERENCE_WORKERS: PreferenceWorkers = {
  medication: null,
  visit_day: null,
  mood: null,
};

function stateFromCurrentPermission(): CurrentPushState {
  const permission = getPushPermissionState();
  return permission === "granted" ? "granted-unsubscribed" : permission;
}

export function NotificationSettingsScreen({
  backHref = "/notifications",
  initialState,
}: NotificationSettingsScreenProps = {}) {
  const router = useRouter();
  const isPreviewFixture = initialState !== undefined;
  const initialPreferences = initialState === "subscribed"
    ? ALL_ENABLED
    : initialState !== undefined
      ? DISABLED_PUSH_PREFERENCES
      : null;
  const [state, setState] = useState<PushSettingsState>(initialState ?? "checking");
  const [preferences, setPreferences] = useState<PushPreferences | null>(initialPreferences);
  const [pending, setPending] = useState<PendingPreferences>(NO_PENDING_PREFERENCES);
  const [error, setError] = useState("");
  const stateRef = useRef<PushSettingsState>(initialState ?? "checking");
  const preferencesRef = useRef<PushPreferences | null>(initialPreferences);
  const confirmedPreferencesRef = useRef<PushPreferences | null>(initialPreferences);
  const pendingRef = useRef<PendingPreferences>(NO_PENDING_PREFERENCES);
  const mutationVersionsRef = useRef<PushPreferenceVersions>({
    ...INITIAL_PUSH_PREFERENCE_VERSIONS,
  });
  const workersRef = useRef<PreferenceWorkers>({ ...NO_PREFERENCE_WORKERS });
  const hasBackEntryRef = useRef(false);
  const snapshotRequestRef = useRef(0);
  const activationRef = useRef<ReturnType<typeof requestPushSubscription> | null>(null);

  function applyState(nextState: PushSettingsState) {
    stateRef.current = nextState;
    setState(nextState);
  }

  function applyPreferences(nextPreferences: PushPreferences, shouldCache = true) {
    preferencesRef.current = nextPreferences;
    setPreferences(nextPreferences);
    if (shouldCache && !isPreviewFixture) cachePushPreferences(nextPreferences);
  }

  function applyPending(kind: PushPreferenceKind, isPending: boolean) {
    const nextPending = { ...pendingRef.current, [kind]: isPending };
    pendingRef.current = nextPending;
    setPending(nextPending);
  }

  useEffect(() => {
    hasBackEntryRef.current = registerNotificationBackEntry(window.location.href);
  }, []);

  useLayoutEffect(() => {
    if (isPreviewFixture || preferencesRef.current) return;
    const cachedPreferences = getCachedPushPreferences();
    if (!cachedPreferences) return;
    confirmedPreferencesRef.current = cachedPreferences;
    applyPreferences(cachedPreferences, false);
  }, [isPreviewFixture]);

  useEffect(() => {
    if (isPreviewFixture) return;
    let active = true;

    async function refreshFromCurrentSubscription() {
      const requestId = ++snapshotRequestRef.current;
      const requestVersions = { ...mutationVersionsRef.current };
      try {
        const snapshot = await getCurrentPushSnapshot();
        if (!active || requestId !== snapshotRequestRef.current) return;
        const currentVersions = mutationVersionsRef.current;
        const hasNewerMutation = Object.keys(currentVersions).some((kind) => {
          const preferenceKind = kind as PushPreferenceKind;
          return currentVersions[preferenceKind] !== requestVersions[preferenceKind];
        });
        if (!hasNewerMutation) applyState(snapshot.state);

        const serverPreferences = snapshot.preferences ?? DISABLED_PUSH_PREFERENCES;
        const merged = mergePushPreferenceSnapshot(
          preferencesRef.current,
          serverPreferences,
          requestVersions,
          currentVersions,
        );
        const mergedConfirmed = mergePushPreferenceSnapshot(
          confirmedPreferencesRef.current,
          serverPreferences,
          requestVersions,
          currentVersions,
        );
        confirmedPreferencesRef.current = mergedConfirmed;
        applyPreferences(merged);
        setError("");
      } catch (error) {
        if (!active || requestId !== snapshotRequestRef.current) return;
        applyState(stateFromCurrentPermission());
        setError(isPushUnavailableError(error)
          ? "현재 환경에서는 알림을 사용할 수 없어요."
          : "알림 상태를 확인하지 못했어요. 다시 시도해주세요.");
      }
    }

    void refreshFromCurrentSubscription();
    return () => {
      active = false;
      snapshotRequestRef.current += 1;
    };
  }, [isPreviewFixture]);

  async function persistLatestPreference(kind: PushPreferenceKind) {
    applyPending(kind, true);
    try {
      while (preferencesRef.current) {
        const mutationVersion = mutationVersionsRef.current[kind];
        const enabled = preferencesRef.current[kind];

        try {
          if (enabled && stateRef.current !== "subscribed") {
            const activation = activationRef.current ?? requestPushSubscription();
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

          if (mutationVersion !== mutationVersionsRef.current[kind]) continue;
          const hasKnownMissingSubscription = !enabled
            && stateRef.current !== "checking"
            && stateRef.current !== "subscribed";
          if (!hasKnownMissingSubscription) {
            await updateCurrentPushPreference(kind, enabled);
          }

          confirmedPreferencesRef.current = setPushPreference(
            confirmedPreferencesRef.current ?? DISABLED_PUSH_PREFERENCES,
            kind,
            enabled,
          );
          if (preferencesRef.current) cachePushPreferences(preferencesRef.current);
          if (mutationVersion === mutationVersionsRef.current[kind]) return;
        } catch (saveError) {
          if (mutationVersion !== mutationVersionsRef.current[kind]) continue;
          const currentPreferences = preferencesRef.current;
          const previousValue = confirmedPreferencesRef.current?.[kind] ?? !enabled;
          if (currentPreferences) {
            applyPreferences(rollbackPushPreference(
              currentPreferences,
              kind,
              enabled,
              previousValue,
            ));
          }
          setError(isPushUnavailableError(saveError)
            ? "현재 환경에서는 알림을 사용할 수 없어요."
            : "알림 설정을 변경하지 못했어요. 잠시 후 다시 시도해주세요.");
          return;
        }
      }
    } finally {
      applyPending(kind, false);
    }
  }

  function startPreferenceWorker(kind: PushPreferenceKind) {
    if (workersRef.current[kind]) return;
    const worker = persistLatestPreference(kind);
    workersRef.current[kind] = worker;
    void worker.finally(() => {
      if (workersRef.current[kind] === worker) workersRef.current[kind] = null;
    });
  }

  function handleToggle(kind: PushPreferenceKind) {
    const currentPreferences = preferencesRef.current;
    const currentState = stateRef.current;
    if (!currentPreferences || currentState === "denied" || currentState === "unsupported") return;
    const previousValue = currentPreferences[kind];
    const enabled = !previousValue;
    mutationVersionsRef.current[kind] += 1;
    applyPreferences(setPushPreference(currentPreferences, kind, enabled));
    setError("");

    if (isPreviewFixture) {
      applyState("subscribed");
      return;
    }
    startPreferenceWorker(kind);
  }

  const stateDisablesControls = preferences === null || state === "denied" || state === "unsupported";
  const hasPendingPreference = Object.values(pending).some(Boolean);

  return (
    <MobileShell className="notification-settings-screen">
      <header className="notifications-header notification-settings-header">
        <button
          type="button"
          onClick={() => navigateBackOrReplace(router, backHref, hasBackEntryRef.current)}
          aria-label="이전 화면"
        >
          <Image src="/icons/back.svg" alt="" width={18} height={14} />
        </button>
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
                  aria-checked={preferences?.[item.kind]}
                  aria-label={preferences
                    ? `${item.title} ${preferences[item.kind] ? "끄기" : "켜기"}`
                    : `${item.title} 상태 확인 중`}
                  onClick={() => handleToggle(item.kind)}
                  disabled={stateDisablesControls}
                  aria-busy={pending[item.kind]}
                >
                  {preferences === null ? null : preferences[item.kind] ? (
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
        </div>
      </section>
      {error ? (
        <Toast message={error} onDismiss={() => setError("")} showIcon={false} />
      ) : null}
    </MobileShell>
  );
}
