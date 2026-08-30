"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MobileShell } from "@/components/mobile-shell";
import {
  isVisibleNotificationType,
  notificationRouteIsSafe,
  type NotificationRecord,
  type VisibleNotificationType,
} from "@/lib/notifications/constants";
import { formatNotificationTime } from "@/lib/notifications/time";
import { ensurePushSubscription } from "@/lib/push/client";

function NotificationIcon({ type }: { type: VisibleNotificationType }) {
  return (
    <span className={`notification-type-icon ${type}`} aria-hidden="true">
      {type === "medication_reminder" ? (
        <Image src="/icons/notification-medication.svg" alt="" width={16} height={21} />
      ) : null}
      {type === "visit_reminder" ? (
        <span className="notification-visit-icon">
          <Image
            className="notification-visit-building"
            src="/icons/notification-visit-building.svg"
            alt=""
            width={26}
            height={26}
          />
          <Image
            className="notification-visit-medication"
            src="/icons/notification-visit-medication.svg"
            alt=""
            width={11}
            height={13}
          />
        </span>
      ) : null}
      {type === "mood_reminder" ? (
        <Image src="/icons/notification-mood.svg" alt="" width={21} height={24} />
      ) : null}
    </span>
  );
}

export function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());
  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.readAt).length,
    [notifications],
  );

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", {
        credentials: "include",
        cache: "no-store",
      });
      if (response.status === 401) {
        setNotifications([]);
        setError("");
        return;
      }
      if (!response.ok) throw new Error("notification_load_failed");
      const result = await response.json() as { notifications?: NotificationRecord[] };
      setNotifications((result.notifications ?? []).filter((notification) => (
        isVisibleNotificationType(notification.notificationType)
      )));
      setError("");
    } catch {
      setError("알림을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void ensurePushSubscription().catch(() => undefined);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  async function markRead(notificationId: string) {
    const response = await fetch("/api/notifications", {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notificationId }),
    });
    if (!response.ok) throw new Error("notification_read_failed");
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((notification) => (
      notification.id === notificationId ? { ...notification, readAt } : notification
    )));
  }

  async function markAllRead() {
    if (unreadCount === 0) return;
    const response = await fetch("/api/notifications", {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    if (!response.ok) {
      setError("모두 읽음 처리하지 못했어요.");
      return;
    }
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((notification) => ({
      ...notification,
      readAt: notification.readAt ?? readAt,
    })));
    setError("");
  }

  async function openNotification(notification: NotificationRecord) {
    if (!notification.readAt) {
      try {
        await markRead(notification.id);
      } catch {
        setError("알림을 읽음 처리하지 못했어요.");
      }
    }
    router.push(notificationRouteIsSafe(notification.route) ? notification.route : "/");
  }

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.replace("/");
  }

  return (
    <MobileShell className="notifications-screen">
      <header className="notifications-header">
        <button type="button" aria-label="이전 화면으로 돌아가기" onClick={goBack}>
          <Image src="/icons/back.svg" alt="" width={24} height={24} />
        </button>
        <h1>알림</h1>
        <button
          type="button"
          className="notifications-read-all"
          disabled={unreadCount === 0}
          onClick={() => void markAllRead()}
        >
          모두 읽음
        </button>
      </header>

      <section className="notifications-content" aria-label="알림 목록" aria-busy={loading}>
        <div className="notifications-list">
          {notifications.map((notification) => {
            if (!isVisibleNotificationType(notification.notificationType)) return null;
            return (
              <button
                type="button"
                className={`notification-row${notification.readAt ? " is-read" : ""}`}
                key={notification.id}
                onClick={() => void openNotification(notification)}
              >
                <NotificationIcon type={notification.notificationType} />
                <span className="notification-copy">
                  <span className="notification-title-row">
                    <strong>{notification.title}</strong>
                    <time dateTime={notification.createdAt}>
                      {formatNotificationTime(notification.createdAt, now)}
                    </time>
                  </span>
                  <span className="notification-body">{notification.body}</span>
                </span>
              </button>
            );
          })}
        </div>

        {!loading && notifications.length === 0 ? (
          <p className="sr-only">표시할 알림이 없습니다.</p>
        ) : null}
        {error ? <p className="notifications-error" role="alert">{error}</p> : null}

        {!loading && notifications.length > 0 ? (
          <div className="notifications-retention-note">
            <span aria-hidden="true" />
            <p>90일 전 알림까지 확인할 수 있어요</p>
            <span aria-hidden="true" />
          </div>
        ) : null}
      </section>
    </MobileShell>
  );
}
