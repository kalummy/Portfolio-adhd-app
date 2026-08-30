"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { hasUnreadNotifications } from "@/lib/notifications";

export function NotificationBellButton() {
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    let active = true;

    void hasUnreadNotifications()
      .then((nextHasUnread) => {
        if (active) setHasUnread(nextHasUnread);
      })
      .catch(() => {
        if (active) setHasUnread(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <Link
      href="/notifications"
      className="home-notification-button"
      aria-label={hasUnread ? "알림함 열기, 읽지 않은 알림 있음" : "알림함 열기"}
    >
      <span className={`home-notification-icon${hasUnread ? " unread" : ""}`} aria-hidden="true">
        <Image
          src={hasUnread ? "/icons/notification-bell-unread.svg" : "/icons/notification-bell.svg"}
          alt=""
          width={hasUnread ? 28 : 21}
          height={hasUnread ? 28 : 23}
          priority
        />
      </span>
    </Link>
  );
}
