"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MobileShell } from "@/components/mobile-shell";
import {
  markNotificationNavigation,
  navigateBackOrReplace,
  registerNotificationBackEntry,
} from "@/lib/navigation-history";
import {
  formatNotificationTime,
  type AppNotification,
  type VisibleNotificationKind,
} from "@/lib/notification-contract";
import {
  listRecentNotifications,
  markAllRecentNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications";
import {
  getCurrentPushState,
  isPushUnavailableError,
  requestPushSubscription,
  type CurrentPushState,
} from "@/lib/push/client";

const ICON_BY_KIND: Record<VisibleNotificationKind, string> = {
  medication: "/icons/notification-medication.svg",
  visit_day: "/icons/notification-visit-building.svg",
  mood: "/icons/notification-mood.svg",
};

const UNREAD_NOTIFICATION_MESSAGE = "addi:notification-unread";

type NotificationsScreenProps = {
  initialNotifications?: AppNotification[];
  referenceNow?: string;
  settingsHref?: string;
  backHref?: string;
  initialPushState?: CurrentPushState;
};

export function NotificationsScreen({
  initialNotifications,
  referenceNow,
  settingsHref = "/notifications/settings",
  backHref = "/",
  initialPushState,
}: NotificationsScreenProps = {}) {
  const router = useRouter();
  const isPreviewFixture = initialNotifications !== undefined;
  const [notifications, setNotifications] = useState<AppNotification[]>(initialNotifications ?? []);
  const [loading, setLoading] = useState(!isPreviewFixture);
  const [updating, setUpdating] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pushState, setPushState] = useState<CurrentPushState | "checking">(
    initialPushState ?? "checking",
  );
  const [pushUpdating, setPushUpdating] = useState(false);
  const [pushError, setPushError] = useState("");
  const [now] = useState(() => referenceNow ? new Date(referenceNow) : new Date());
  const hasBackEntryRef = useRef(false);
  const refreshVersionRef = useRef(0);

  useEffect(() => {
    hasBackEntryRef.current = registerNotificationBackEntry(window.location.href);
  }, []);

  useEffect(() => {
    if (isPreviewFixture) return;
    let active = true;

    function refreshNotifications() {
      const refreshVersion = ++refreshVersionRef.current;
      void listRecentNotifications(now)
        .then((nextNotifications) => {
          if (!active || refreshVersion !== refreshVersionRef.current) return;
          setNotifications(nextNotifications);
          setLoadFailed(false);
        })
        .catch(() => {
          if (active && refreshVersion === refreshVersionRef.current) setLoadFailed(true);
        })
        .finally(() => {
          if (active && refreshVersion === refreshVersionRef.current) setLoading(false);
        });
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") refreshNotifications();
    }

    function refreshAfterPush(event: MessageEvent<unknown>) {
      const message = event.data;
      if (message && typeof message === "object" && "type" in message
        && message.type === UNREAD_NOTIFICATION_MESSAGE) {
        refreshNotifications();
      }
    }

    refreshNotifications();
    window.addEventListener("focus", refreshNotifications);
    window.addEventListener("pageshow", refreshNotifications);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    navigator.serviceWorker?.addEventListener("message", refreshAfterPush);

    return () => {
      active = false;
      refreshVersionRef.current += 1;
      window.removeEventListener("focus", refreshNotifications);
      window.removeEventListener("pageshow", refreshNotifications);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      navigator.serviceWorker?.removeEventListener("message", refreshAfterPush);
    };
  }, [isPreviewFixture, now]);

  useEffect(() => {
    if (initialPushState !== undefined) return;
    let active = true;

    void getCurrentPushState()
      .then((nextState) => {
        if (active) setPushState(nextState);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setPushState("granted-unsubscribed");
        if (isPushUnavailableError(error)) {
          setPushError("현재 환경에서는 알림을 사용할 수 없어요.");
        }
      });

    return () => {
      active = false;
    };
  }, [initialPushState]);

  const hasUnread = notifications.some((notification) => notification.readAt === null);
  async function handleNotificationClick(notification: AppNotification) {
    if (updating) return;
    setUpdating(true);

    try {
      if (notification.readAt === null) {
        const readAt = new Date();
        if (!isPreviewFixture) await markNotificationRead(notification.id, readAt);
        setNotifications((current) => current.map((candidate) => (
          candidate.id === notification.id
            ? { ...candidate, readAt: readAt.toISOString() }
            : candidate
        )));
      }
      router.push(notification.targetUrl);
    } catch {
      setLoadFailed(true);
    } finally {
      setUpdating(false);
    }
  }

  async function handleMarkAllRead() {
    if (!hasUnread || updating) return;
    setUpdating(true);

    try {
      const readAt = new Date();
      if (!isPreviewFixture) await markAllRecentNotificationsRead(readAt);
      setNotifications((current) => current.map((notification) => (
        notification.readAt === null
          ? { ...notification, readAt: readAt.toISOString() }
          : notification
      )));
    } catch {
      setLoadFailed(true);
    } finally {
      setUpdating(false);
    }
  }

  async function handleEnablePush() {
    if (pushUpdating || pushState === "checking") return;
    if (isPreviewFixture) {
      setPushState("subscribed");
      setPushError("");
      return;
    }

    if (pushState === "denied") {
      setPushError("기기 또는 브라우저 설정에서 알림을 허용해주세요.");
      return;
    }
    if (pushState === "unsupported") {
      setPushError("이 브라우저에서는 시스템 알림을 사용할 수 없어요.");
      return;
    }

    setPushUpdating(true);
    setPushError("");
    try {
      const result = await requestPushSubscription();
      setPushState(result.status);
      if (result.status === "denied") {
        setPushError("기기 또는 브라우저 설정에서 알림을 허용해주세요.");
      }
    } catch (error) {
      setPushError(isPushUnavailableError(error)
        ? "현재 환경에서는 알림을 사용할 수 없어요."
        : "알림을 켜지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setPushUpdating(false);
    }
  }

  const pushOff = pushState !== "checking" && pushState !== "subscribed";
  const showNotificationList = !loading && !pushOff && notifications.length > 0;
  const showEmptyInbox = !loading && !pushOff && notifications.length === 0;

  return (
    <MobileShell className="notifications-screen">
      <header className="notifications-header">
        <button
          type="button"
          onClick={() => navigateBackOrReplace(router, backHref, hasBackEntryRef.current)}
          aria-label="이전 화면"
        >
          <Image src="/icons/back.svg" alt="" width={18} height={14} />
        </button>
        <h1>알림</h1>
        <div className="notifications-actions">
          <Link
            className="notifications-settings"
            href={settingsHref}
            onNavigate={() => markNotificationNavigation(settingsHref)}
          >
            설정
          </Link>
          <button
            type="button"
            className="notifications-mark-all"
            onClick={() => void handleMarkAllRead()}
            disabled={loading || !hasUnread || updating}
          >
            모두 읽음
          </button>
        </div>
      </header>

      <section className="notifications-content" aria-busy={loading}>
        <p className="sr-only" aria-live="polite">
          {loadFailed ? "알림을 불러오지 못했어요." : loading ? "알림을 불러오는 중" : ""}
        </p>
        {showNotificationList ? (
          <div className="notifications-list">
            {notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                className={`notification-row${notification.readAt === null ? " unread" : ""}`}
                onClick={() => void handleNotificationClick(notification)}
                disabled={updating}
              >
                <span className="notification-row-inner">
                  <span className="notification-icon" aria-hidden="true">
                    {notification.kind === "visit_day" ? (
                      <span className="notification-visit-icon">
                        <Image src={ICON_BY_KIND.visit_day} alt="" width={26} height={26} />
                        <Image
                          src="/icons/notification-visit-medication.svg"
                          alt=""
                          width={10.2152}
                          height={12.8884}
                        />
                      </span>
                    ) : (
                      <Image
                        src={ICON_BY_KIND[notification.kind]}
                        alt=""
                        width={notification.kind === "medication" ? 16 : 21}
                        height={notification.kind === "medication" ? 21 : 25}
                      />
                    )}
                  </span>
                  <span className="notification-copy">
                    <span className="notification-title-row">
                      <strong>{notification.title}</strong>
                      <time dateTime={notification.firedAt}>
                        {formatNotificationTime(notification.firedAt, now)}
                      </time>
                    </span>
                    <span className="notification-body">{notification.body}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {!loading && pushOff ? (
          <div className="notifications-state notifications-push-off-state">
            <span className="notifications-state-icon" aria-hidden="true">
              <Image src="/icons/notification-off-bell.svg" alt="" width={43.2006} height={48.0597} priority />
            </span>
            <p>
              <span>받은 알림이 없어요.</span>
              <span>알림을 켜고 복용기록을 이어가세요.</span>
            </p>
            <button
              type="button"
              className="notifications-enable-push"
              onClick={() => void handleEnablePush()}
              disabled={pushUpdating}
              aria-busy={pushUpdating}
            >
              알림 켜기
            </button>
            {pushError ? <span className="notifications-state-error" role="alert">{pushError}</span> : null}
          </div>
        ) : null}

        {showEmptyInbox ? (
          <div className="notifications-state notifications-empty-state">
            <span className="notifications-state-icon" aria-hidden="true">
              <Image src="/icons/notification-off-bell.svg" alt="" width={43.2006} height={48.0597} priority />
            </span>
            <p>받은 알림이 없어요.</p>
          </div>
        ) : null}

        {showNotificationList ? (
          <div className="notifications-retention-note">
            <i />
            <span>90일 전 알림까지 확인할 수 있어요</span>
            <i />
          </div>
        ) : null}
      </section>
    </MobileShell>
  );
}
