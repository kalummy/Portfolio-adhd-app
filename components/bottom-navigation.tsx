"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/auth/client";
import {
  DEFAULT_ADDI_PROFILE_ID,
  getAddiProfileAsset,
  getAddiProfileId,
  isAddiProfileId,
  type AddiProfileId,
} from "@/lib/profile";

type BottomNavigationProps = {
  activeTab: "home" | "moods" | "my";
  profileId?: AddiProfileId;
};

export function BottomNavigation({
  activeTab,
  profileId: initialProfileId = DEFAULT_ADDI_PROFILE_ID,
}: BottomNavigationProps) {
  const [profileId, setProfileId] = useState(initialProfileId);

  useEffect(() => {
    let active = true;
    void getCurrentUser().then((user) => {
      if (active) setProfileId(getAddiProfileId(user));
    });

    const handleProfileChanged = (event: Event) => {
      const nextProfileId = (event as CustomEvent<{ profileId?: unknown }>).detail?.profileId;
      if (isAddiProfileId(nextProfileId)) setProfileId(nextProfileId);
    };
    window.addEventListener("addi:profile-changed", handleProfileChanged);
    return () => {
      active = false;
      window.removeEventListener("addi:profile-changed", handleProfileChanged);
    };
  }, []);

  return (
    <nav className="bottom-navigation" aria-label="주요 메뉴">
      <div className="bottom-navigation-tabs">
        <Link
          href="/"
          className={`bottom-navigation-tab${activeTab === "home" ? " active" : ""}`}
          aria-current={activeTab === "home" ? "page" : undefined}
        >
          <span className="bottom-navigation-icon bottom-navigation-home-icon" aria-hidden="true">
            <Image
              src={activeTab === "home" ? "/icons/nav-home.svg" : "/icons/nav-home-inactive.svg"}
              alt=""
              width={23}
              height={23}
            />
          </span>
          <span>홈</span>
        </Link>
        <Link
          href="/moods"
          className={`bottom-navigation-tab${activeTab === "moods" ? " active" : ""}`}
          aria-current={activeTab === "moods" ? "page" : undefined}
        >
          <span className="bottom-navigation-icon" aria-hidden="true">
            <Image
              src={activeTab === "moods" ? "/icons/nav-heart-active.svg" : "/icons/nav-heart.svg"}
              alt=""
              width={28}
              height={28}
            />
          </span>
          <span>감정기록</span>
        </Link>
        <Link
          href="/my"
          className={`bottom-navigation-tab${activeTab === "my" ? " active" : ""}`}
          aria-current={activeTab === "my" ? "page" : undefined}
        >
          <span className="bottom-navigation-icon" aria-hidden="true">
            <Image src={getAddiProfileAsset(profileId)} alt="" width={28} height={28} />
          </span>
          <span>마이홈</span>
        </Link>
      </div>
    </nav>
  );
}
