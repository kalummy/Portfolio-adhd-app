"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [profileId, setProfileId] = useState(initialProfileId);
  const [useIosSwitchHaptics, setUseIosSwitchHaptics] = useState(false);

  useEffect(() => {
    router.prefetch("/");
    router.prefetch("/moods");
    router.prefetch("/my");

    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setUseIosSwitchHaptics(isIos);

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
  }, [router]);

  function handleTabPointerDown() {
    if ("vibrate" in navigator) navigator.vibrate(8);
  }

  function iosHapticNavigationControl(href: "/" | "/moods" | "/my", label: string) {
    if (!useIosSwitchHaptics) return null;

    return (
      <input
        {...({ switch: "" } as { switch: string })}
        className="bottom-navigation-ios-haptic"
        type="checkbox"
        aria-hidden="true"
        aria-label={`${label} 이동 햅틱`}
        tabIndex={-1}
        onChange={() => router.push(href)}
      />
    );
  }

  return (
    <nav className="bottom-navigation" aria-label="주요 메뉴">
      <div className="bottom-navigation-tabs">
        <span className="bottom-navigation-tab-wrap">
          <Link
            href="/"
            className={`bottom-navigation-tab${activeTab === "home" ? " active" : ""}`}
            aria-current={activeTab === "home" ? "page" : undefined}
            onPointerDown={handleTabPointerDown}
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
          {iosHapticNavigationControl("/", "홈")}
        </span>
        <span className="bottom-navigation-tab-wrap">
          <Link
            href="/moods"
            className={`bottom-navigation-tab${activeTab === "moods" ? " active" : ""}`}
            aria-current={activeTab === "moods" ? "page" : undefined}
            onPointerDown={handleTabPointerDown}
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
          {iosHapticNavigationControl("/moods", "감정기록")}
        </span>
        <span className="bottom-navigation-tab-wrap">
          <Link
            href="/my"
            className={`bottom-navigation-tab${activeTab === "my" ? " active" : ""}`}
            aria-current={activeTab === "my" ? "page" : undefined}
            onPointerDown={handleTabPointerDown}
          >
            <span className="bottom-navigation-icon" aria-hidden="true">
              <Image src={getAddiProfileAsset(profileId)} alt="" width={28} height={28} />
            </span>
            <span>마이홈</span>
          </Link>
          {iosHapticNavigationControl("/my", "마이홈")}
        </span>
      </div>
    </nav>
  );
}
