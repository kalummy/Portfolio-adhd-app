"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MobileShell } from "@/components/mobile-shell";
import { PrimaryButton } from "@/components/flow-ui";
import {
  getCurrentPushState,
  getPushPermissionState,
  requestPushSubscription,
  unsubscribeFromPush,
  type CurrentPushState,
} from "@/lib/push/client";

type PushSettingsState = "checking" | CurrentPushState;

type NotificationSettingsScreenProps = {
  backHref?: string;
  initialState?: PushSettingsState;
};

function stateDescription(state: PushSettingsState) {
  if (state === "subscribed") return "알림을 받고 있어요.";
  if (state === "granted-unsubscribed") return "이 기기에서 알림을 켜주세요.";
  if (state === "denied") return "기기 설정에서 알림을 허용해주세요.";
  if (state === "unsupported") return "이 브라우저에서는 푸시 알림을 사용할 수 없어요.";
  if (state === "checking") return "알림 상태를 확인하고 있어요.";
  return "알림을 켜면 복용과 내원 일정을 알려드려요.";
}

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refreshState = useCallback(async () => {
    try {
      setState(await getCurrentPushState());
      setError("");
    } catch {
      setState(stateFromCurrentPermission());
      setError("알림 상태를 확인하지 못했어요. 다시 시도해주세요.");
    }
  }, []);

  useEffect(() => {
    if (isPreviewFixture) return;
    let active = true;

    void getCurrentPushState()
      .then((nextState) => {
        if (!active) return;
        setState(nextState);
        setError("");
      })
      .catch(() => {
        if (!active) return;
        setState(stateFromCurrentPermission());
        setError("알림 상태를 확인하지 못했어요. 다시 시도해주세요.");
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

  async function handleEnable() {
    if (busy || state === "denied" || state === "unsupported") return;
    if (isPreviewFixture) {
      setState("subscribed");
      return;
    }
    setBusy(true);
    setError("");

    try {
      const result = await requestPushSubscription();
      if (result.status === "subscribed") {
        setState("subscribed");
      } else {
        setState(result.status);
      }
    } catch {
      setState(getPushPermissionState() === "granted" ? "granted-unsubscribed" : "default");
      setError("알림을 켜지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    if (busy || state !== "subscribed") return;
    if (isPreviewFixture) {
      setState("granted-unsubscribed");
      return;
    }
    setBusy(true);
    setError("");

    try {
      await unsubscribeFromPush();
      setState("granted-unsubscribed");
    } catch {
      setError("알림을 끄지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  const canEnable = state === "default" || state === "granted-unsubscribed";

  return (
    <MobileShell className="notification-settings-screen">
      <header className="notifications-header notification-settings-header">
        <Link href={backHref} aria-label="이전 화면">
          <Image src="/icons/back.svg" alt="" width={18} height={14} />
        </Link>
        <h1>알림 설정</h1>
      </header>

      <section className="notification-settings-content" aria-busy={busy}>
        <div className="notification-settings-copy">
          <h2>알림 받기</h2>
          <p>{stateDescription(state)}</p>
          {state === "denied" ? (
            <p className="notification-settings-guide">
              브라우저의 사이트 설정 또는 기기 설정의 알림 메뉴에서 ADDI 알림을 허용한 뒤 다시 열어주세요.
            </p>
          ) : null}
        </div>

        {canEnable ? (
          <PrimaryButton type="button" variant="soft" onClick={() => void handleEnable()} disabled={busy} aria-busy={busy}>
            {busy ? "알림 켜는 중" : "알림 켜기"}
          </PrimaryButton>
        ) : null}
        {state === "subscribed" ? (
          <PrimaryButton type="button" variant="secondary" onClick={() => void handleDisable()} disabled={busy} aria-busy={busy}>
            {busy ? "알림 끄는 중" : "알림 끄기"}
          </PrimaryButton>
        ) : null}

        {error ? <p className="notification-settings-error" role="alert">{error}</p> : null}
      </section>
    </MobileShell>
  );
}
