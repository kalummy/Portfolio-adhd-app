"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MobileShell } from "@/components/mobile-shell";
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
  requestPushSubscription,
  type CurrentPushState,
} from "@/lib/push/client";

const ICON_BY_KIND: Record<VisibleNotificationKind, string> = {
  medication: "/icons/notification-medication.svg",
  visit_day: "/icons/notification-visit-building.svg",
  mood: "/icons/notification-mood.svg",
};

type NotificationsScreenProps = {
  initialNotifications?: AppNotification[];
  referenceNow?: string;
  settingsHref?: string;
  initialPushState?: CurrentPushState;
};

type NotificationsPushState = "checking" | "unknown" | CurrentPushState;

export function NotificationsScreen({
  initialNotifications,
  referenceNow,
  settingsHref = "/notifications/settings",
  initialPushState,
}: NotificationsScreenProps = {}) {
  const router = useRouter();
  const isPreviewFixture = initialNotifications !== undefined;
  const isPushPreviewFixture = initialPushState !== undefined;
  const [notifications, setNotifications] = useState<AppNotification[]>(initialNotifications ?? []);
  const [pushState, setPushState] = useState<NotificationsPushState>(initialPushState ?? "checking");
  const [loading, setLoading] = useState(!isPreviewFixture);
  const [updating, setUpdating] = useState(false);
  const [enablingPush, setEnablingPush] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [now] = useState(() => referenceNow ? new Date(referenceNow) : new Date());

  useEffect(() => {
    if (isPreviewFixture) return;
    let active = true;

    void listRecentNotifications(now)
      .then((nextNotifications) => {
        if (!active) return;
        setNotifications(nextNotifications);
        setLoadFailed(false);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isPreviewFixture, now]);

  useEffect(() => {
    if (isPushPreviewFixture) return;
    let active = true;

    function refreshPushState() {
      void getCurrentPushState()
        .then((nextState) => {
          if (active) setPushState(nextState);
        })
        .catch(() => {
          if (active) setPushState("unknown");
        });
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") refreshPushState();
    }

    refreshPushState();
    window.addEventListener("focus", refreshPushState);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshPushState);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [isPushPreviewFixture]);

  const hasUnread = notifications.some((notification) => notification.readAt === null);
  const showPushOffState = pushState !== "checking"
    && pushState !== "unknown"
    && pushState !== "subscribed";

  async function handleEnablePush() {
    if (enablingPush) return;
    if (isPreviewFixture || isPushPreviewFixture) {
      setPushState("subscribed");
      return;
    }
    if (pushState === "denied" || pushState === "unsupported") {
      return;
    }

    setEnablingPush(true);
    try {
      await requestPushSubscription();
      setPushState("subscribed");
    } catch {
      setPushState(await getCurrentPushState().catch(() => "unknown"));
    } finally {
      setEnablingPush(false);
    }
  }

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
    if (pushState === "checking" || showPushOffState || !hasUnread || updating) return;
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

  return (
    <MobileShell className="notifications-screen">
      <header className="notifications-header">
        <button type="button" onClick={() => router.back()} aria-label="이전 화면">
          <Image src="/icons/back.svg" alt="" width={18} height={14} />
        </button>
        <h1>알림</h1>
        <div className="notifications-actions">
          <Link className="notifications-settings" href={settingsHref}>
            설정
          </Link>
          <button
            type="button"
            className="notifications-mark-all"
            onClick={() => void handleMarkAllRead()}
            disabled={pushState === "checking" || showPushOffState || !hasUnread || updating}
          >
            모두 읽음
          </button>
        </div>
      </header>

      <section className="notifications-content" aria-busy={loading || pushState === "checking"}>
        <p className="sr-only" aria-live="polite">
          {loadFailed ? "알림을 불러오지 못했어요." : loading ? "알림을 불러오는 중" : ""}
        </p>
        {pushState === "checking" ? null : showPushOffState ? (
          <div className="notifications-off-state">
            <span className="notifications-off-icon" aria-hidden="true">
              <Image src="/icons/notification-off-bell.svg" alt="" width={43.2006} height={48.0597} priority />
            </span>
            <p className="notifications-off-copy">
              <span>받은 알림이 없어요.</span>
              <span>알림을 켜고 복용기록을 이어가세요.</span>
            </p>
            <button
              type="button"
              className="notifications-off-enable"
              onClick={() => void handleEnablePush()}
              disabled={enablingPush}
              aria-busy={enablingPush}
            >
              알림 켜기
            </button>
          </div>
        ) : (
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
        )}

        {pushState !== "checking" && !showPushOffState ? (
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
