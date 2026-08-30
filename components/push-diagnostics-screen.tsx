"use client";

import { useCallback, useEffect, useState } from "react";
import { MobileShell } from "@/components/mobile-shell";
import {
  getCurrentPushSubscription,
  requestPushSubscription,
  updateCurrentPushPreference,
} from "@/lib/push/client";

const DIRECT_TEST_TAG = "addi-preview-direct-notification-test";
const PUSH_DIAGNOSTIC_MESSAGE = "addi:push-diagnostic";

type DiagnosticSnapshot = {
  runtime: string;
  permission: NotificationPermission | "unsupported";
  serviceWorkerState: string;
  serviceWorkerScope: string;
  hasPushSubscription: boolean;
};

type PushDiagnosticStage = "push_received" | "notification_shown" | "notification_failed";

function detectRuntime() {
  if (document.referrer.startsWith("android-app://")) return "TWA 설치본";
  if (window.matchMedia("(display-mode: standalone)").matches) {
    return "홈 화면에 추가한 PWA";
  }

  const userAgent = navigator.userAgent;
  if (/SamsungBrowser/i.test(userAgent)) return "Samsung Internet 일반 탭";
  if (/Android/i.test(userAgent) && /Chrome\//i.test(userAgent)) return "Chrome 일반 탭";
  return "기타 브라우저 환경";
}

function diagnosticStageLabel(stage: PushDiagnosticStage) {
  if (stage === "push_received") return "Service Worker push event 수신";
  if (stage === "notification_shown") return "showNotification 완료";
  return "showNotification 실패";
}

export function PushDiagnosticsScreen({
  providerTestEnabled,
}: {
  providerTestEnabled: boolean;
}) {
  const [snapshot, setSnapshot] = useState<DiagnosticSnapshot | null>(null);
  const [directResult, setDirectResult] = useState("아직 실행하지 않음");
  const [providerResult, setProviderResult] = useState("아직 실행하지 않음");
  const [lastPushStage, setLastPushStage] = useState<PushDiagnosticStage | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshSnapshot = useCallback(async () => {
    if (!("serviceWorker" in navigator)) {
      setSnapshot({
        runtime: detectRuntime(),
        permission: typeof Notification === "undefined" ? "unsupported" : Notification.permission,
        serviceWorkerState: "unsupported",
        serviceWorkerScope: "없음",
        hasPushSubscription: false,
      });
      return;
    }

    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    setSnapshot({
      runtime: detectRuntime(),
      permission: typeof Notification === "undefined" ? "unsupported" : Notification.permission,
      serviceWorkerState: registration?.active?.state
        ?? registration?.waiting?.state
        ?? registration?.installing?.state
        ?? "미등록",
      serviceWorkerScope: registration?.scope ?? "없음",
      hasPushSubscription: Boolean(subscription),
    });
  }, []);

  useEffect(() => {
    void refreshSnapshot();

    function handleServiceWorkerMessage(event: MessageEvent<unknown>) {
      const message = event.data;
      if (!message || typeof message !== "object" || !("type" in message) || !("stage" in message)) {
        return;
      }
      if (message.type !== PUSH_DIAGNOSTIC_MESSAGE) return;
      if (
        message.stage === "push_received"
        || message.stage === "notification_shown"
        || message.stage === "notification_failed"
      ) {
        setLastPushStage(message.stage);
      }
    }

    navigator.serviceWorker?.addEventListener("message", handleServiceWorkerMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", handleServiceWorkerMessage);
    };
  }, [refreshSnapshot]);

  async function runDirectNotificationTest() {
    if (busy) return;
    setBusy(true);
    setDirectResult("실행 중");

    try {
      if (!("serviceWorker" in navigator) || typeof Notification === "undefined") {
        setDirectResult("이 브라우저는 Web Notification을 지원하지 않음");
        return;
      }

      let permission = Notification.permission;
      if (permission === "default") permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setDirectResult(`Notification.permission=${permission}`);
        return;
      }

      const existing = await navigator.serviceWorker.getRegistration("/");
      if (!existing) await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification("복용 알림", {
        body: "오늘 복용기록이 없어요.",
        icon: "/icon.png",
        badge: "/icon.png",
        tag: DIRECT_TEST_TAG,
      });
      const notifications = await registration.getNotifications({ tag: DIRECT_TEST_TAG });
      setDirectResult(
        notifications.length > 0
          ? "showNotification 완료 · Galaxy OS 표시 여부를 직접 확인하세요"
          : "showNotification 완료 · 등록된 notification은 확인되지 않음",
      );
    } catch {
      setDirectResult("showNotification 실패 · Service Worker 콘솔 확인 필요");
    } finally {
      await refreshSnapshot().catch(() => undefined);
      setBusy(false);
    }
  }

  async function runProviderPushTest() {
    if (busy || !providerTestEnabled) return;
    setBusy(true);
    setProviderResult("실행 중");
    setLastPushStage(null);

    try {
      const result = await requestPushSubscription();
      if (result.status !== "subscribed") {
        setProviderResult(`Push 구독 실패: ${result.status}`);
        return;
      }
      await updateCurrentPushPreference("medication", true);
      const subscription = await getCurrentPushSubscription();
      if (!subscription) {
        setProviderResult("PushSubscription 없음");
        return;
      }

      const response = await fetch("/api/push/test", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      const body = await response.json().catch(() => null) as { delivered?: unknown } | null;
      setProviderResult(
        response.ok && body?.delivered === 1
          ? "Provider accepted · Service Worker 단계 대기 중"
          : `Provider test 실패 (${response.status})`,
      );
    } catch {
      setProviderResult("Provider test 실행 실패");
    } finally {
      await refreshSnapshot().catch(() => undefined);
      setBusy(false);
    }
  }

  return (
    <MobileShell className="push-diagnostics-screen">
      <h1>Galaxy Push 진단</h1>
      <p>이 화면은 Preview/Dev에서만 열리며 endpoint 값이나 계정 식별자를 표시하지 않습니다.</p>

      <dl className="push-diagnostics-list">
        <div>
          <dt>실행 환경</dt>
          <dd>{snapshot?.runtime ?? "확인 중"}</dd>
        </div>
        <div>
          <dt>Notification.permission</dt>
          <dd>{snapshot?.permission ?? "확인 중"}</dd>
        </div>
        <div>
          <dt>Service Worker</dt>
          <dd>{snapshot?.serviceWorkerState ?? "확인 중"}</dd>
        </div>
        <div>
          <dt>Service Worker scope</dt>
          <dd>{snapshot?.serviceWorkerScope ?? "확인 중"}</dd>
        </div>
        <div>
          <dt>PushSubscription</dt>
          <dd>{snapshot ? (snapshot.hasPushSubscription ? "존재" : "없음") : "확인 중"}</dd>
        </div>
        <div>
          <dt>Android 앱 알림</dt>
          <dd>웹에서 확인 불가 · Galaxy 설정에서 확인</dd>
        </div>
      </dl>

      <div className="push-diagnostics-actions">
        <button type="button" onClick={() => void refreshSnapshot()} disabled={busy}>
          상태 다시 확인
        </button>
        <button type="button" onClick={() => void runDirectNotificationTest()} disabled={busy}>
          OS notification 직접 표시 테스트
        </button>
        <button
          type="button"
          onClick={() => void runProviderPushTest()}
          disabled={busy || !providerTestEnabled}
        >
          Preview provider → SW 테스트
        </button>
      </div>

      <div className="push-diagnostics-result" aria-live="polite">
        <div>직접 표시: {directResult}</div>
        <div>Provider: {providerResult}</div>
        <div>SW 단계: {lastPushStage ? diagnosticStageLabel(lastPushStage) : "수신 전"}</div>
      </div>
    </MobileShell>
  );
}
