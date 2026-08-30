"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { hasUnreadNotifications } from "@/lib/notifications";

type NotificationBellButtonProps = {
  href?: string;
  initialHasUnread?: boolean;
  loadUnreadState?: boolean;
};

export function NotificationBellButton({
  href = "/notifications",
  initialHasUnread = false,
  loadUnreadState = true,
}: NotificationBellButtonProps) {
  const [hasUnread, setHasUnread] = useState(initialHasUnread);

  useEffect(() => {
    if (!loadUnreadState) return;
    let active = true;

    function refreshUnreadState() {
      void hasUnreadNotifications()
        .then((nextHasUnread) => {
          if (active) setHasUnread(nextHasUnread);
        })
        .catch(() => {
          if (active) setHasUnread(false);
        });
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") refreshUnreadState();
    }

    refreshUnreadState();
    window.addEventListener("focus", refreshUnreadState);
    window.addEventListener("pageshow", refreshUnreadState);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      active = false;
      window.removeEventListener("focus", refreshUnreadState);
      window.removeEventListener("pageshow", refreshUnreadState);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadUnreadState]);

  return (
    <Link
      href={href}
      className="home-notification-button"
      aria-label={hasUnread ? "알림함 열기, 읽지 않은 알림 있음" : "알림함 열기"}
    >
      <span className="home-notification-icon" aria-hidden="true">
        <span className="home-notification-bell-glyph" />
        {hasUnread ? (
          <span className="home-notification-red-dot">
            <Image src="/icons/notification-red-dot.svg" alt="" width={7} height={7} priority />
          </span>
        ) : null}
      </span>
    </Link>
  );
}
