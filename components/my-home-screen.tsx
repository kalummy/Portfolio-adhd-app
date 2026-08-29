"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BottomNavigation } from "@/components/bottom-navigation";
import { MobileShell } from "@/components/mobile-shell";
import { signOut } from "@/lib/auth/client";
import {
  LEGACY_HOME_SPLASH_SESSION_KEY,
  MEMBER_SPLASH_SESSION_KEY,
} from "@/lib/auth/routes";
import { restoreClaimedGuestDatasetVisibilityForUser } from "@/lib/indexed-db";

export function MyHomeScreen({ displayName, userId }: { displayName: string; userId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSignOut() {
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      await restoreClaimedGuestDatasetVisibilityForUser(userId);
      await signOut();
      try {
        window.sessionStorage.removeItem(MEMBER_SPLASH_SESSION_KEY);
        window.sessionStorage.removeItem(LEGACY_HOME_SPLASH_SESSION_KEY);
        document.documentElement.removeAttribute("data-addi-member-splash");
        document.documentElement.removeAttribute("data-addi-splash");
      } catch {
        // Signing out remains successful when sessionStorage is unavailable.
      }
      router.replace("/auth/login");
      router.refresh();
    } catch {
      setError("로그아웃하지 못했어요. 다시 시도해주세요.");
      setBusy(false);
    }
  }

  return (
    <MobileShell className="my-home-screen">
      <header className="my-home-header">
        <strong>마이홈</strong>
      </header>

      <section className="my-home-content">
        <div className="my-home-profile">
          <div className="my-home-profile-image-wrap">
            <Image
              src="/profile/random-profile-96.svg"
              alt=""
              width={96}
              height={96}
              priority
            />
            <button
              type="button"
              className="my-home-profile-edit"
              aria-label="프로필 이미지 변경 (준비 중)"
              disabled
            >
              <Image src="/profile/pencil.svg" alt="" width={12} height={12} />
            </button>
          </div>
          <strong className="my-home-name">{displayName}</strong>
        </div>

        <div className="my-home-menu">
          <button type="button" className="my-home-menu-row primary" disabled>
            <span>간편 로그인 설정</span>
            <Image src="/profile/chevron-right.svg" alt="" width={20} height={20} />
          </button>
          <button
            type="button"
            className="my-home-menu-row"
            disabled={busy}
            aria-busy={busy}
            onClick={() => void handleSignOut()}
          >
            <span>{busy ? "로그아웃 중" : "로그아웃"}</span>
            <Image src="/profile/chevron-right.svg" alt="" width={20} height={20} />
          </button>
          <button type="button" className="my-home-menu-row" disabled>
            <span>회원탈퇴</span>
            <Image src="/profile/chevron-right.svg" alt="" width={20} height={20} />
          </button>
        </div>

        {error ? <p className="my-home-error" role="alert">{error}</p> : null}
      </section>

      <BottomNavigation activeTab="my" />
    </MobileShell>
  );
}
