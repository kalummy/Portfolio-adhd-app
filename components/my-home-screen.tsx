"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BottomNavigation } from "@/components/bottom-navigation";
import { MobileShell } from "@/components/mobile-shell";
import { VisitDialog } from "@/components/visit-dialog";
import { useAppVersion } from "@/components/app-version-provider";
import { signOut, updateAddiProfile } from "@/lib/auth/client";
import {
  LEGACY_HOME_SPLASH_SESSION_KEY,
  MEMBER_SPLASH_SESSION_KEY,
} from "@/lib/auth/routes";
import { restoreClaimedGuestDatasetVisibilityForUser } from "@/lib/indexed-db";
import {
  ADDI_PROFILES,
  getAddiProfileAsset,
  type AddiProfileId,
} from "@/lib/profile";

type MyHomeScreenProps = {
  displayName: string;
  userId: string;
  initialProfileId: AddiProfileId;
};

export function MyHomeScreen({ displayName, userId, initialProfileId }: MyHomeScreenProps) {
  const router = useRouter();
  const {
    currentAppVersion,
    latestAppVersion,
    updateStatus,
    isTwa,
    openingStore,
    requestUpdate,
  } = useAppVersion();
  const sheetRef = useRef<HTMLElement>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileId, setProfileId] = useState(initialProfileId);
  const [candidateProfileId, setCandidateProfileId] = useState(initialProfileId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profileOpen) return;
    const previousFocus = document.activeElement;
    sheetRef.current?.querySelector<HTMLButtonElement>("button")?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      setProfileOpen(false);
      setCandidateProfileId(profileId);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [busy, profileId, profileOpen]);

  function openProfileSheet() {
    setCandidateProfileId(profileId);
    setError("");
    setProfileOpen(true);
  }

  function closeProfileSheet() {
    if (busy) return;
    setCandidateProfileId(profileId);
    setProfileOpen(false);
  }

  async function saveProfile() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await updateAddiProfile(candidateProfileId);
      setProfileId(candidateProfileId);
      setProfileOpen(false);
      router.refresh();
    } catch {
      setError("프로필을 저장하지 못했어요. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

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
          <button
            type="button"
            className="my-home-profile-image-wrap"
            aria-label="프로필 이미지 변경"
            aria-haspopup="dialog"
            aria-expanded={profileOpen}
            onClick={openProfileSheet}
          >
            <Image src={getAddiProfileAsset(profileId)} alt="" width={96} height={96} priority />
            <span className="my-home-profile-edit" aria-hidden="true">
              <Image src="/profile/pencil.svg" alt="" width={16} height={16} />
            </span>
          </button>
          <strong className="my-home-name">{displayName}</strong>
        </div>

        <div className="my-home-menu">
          <div className={`my-home-version-row ${isTwa && updateStatus !== "current" ? "update-available" : ""}`.trim()}>
            <div className="my-home-version-copy">
              <div className="my-home-version-title">
                <span>아디 버전</span>
                <strong>{currentAppVersion}</strong>
              </div>
              {isTwa && updateStatus !== "current" ? (
                <p>최신 버전 업데이트가 필요합니다.</p>
              ) : null}
            </div>
            {isTwa && updateStatus !== "current" ? (
              <button
                type="button"
                className="my-home-update-button"
                disabled={openingStore}
                aria-busy={openingStore}
                aria-label={`아디 ${latestAppVersion} 버전으로 업데이트`}
                onClick={requestUpdate}
              >
                업데이트
              </button>
            ) : null}
          </div>
          <Link href="/my/social-login" className="my-home-menu-row primary">
            <span>간편 로그인 설정</span>
            <Image src="/profile/chevron-right.svg" alt="" width={20} height={20} />
          </Link>
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
          <button
            type="button"
            className="my-home-menu-row"
            disabled={busy}
            onClick={() => setDeleteDialogOpen(true)}
          >
            <span>회원탈퇴</span>
            <Image src="/profile/chevron-right.svg" alt="" width={20} height={20} />
          </button>
        </div>

        {error ? <p className="my-home-error" role="alert">{error}</p> : null}
      </section>

      <BottomNavigation activeTab="my" profileId={profileId} />

      {profileOpen ? (
        <div className="my-home-sheet-layer" role="presentation" onMouseDown={closeProfileSheet}>
          <section
            ref={sheetRef}
            className="my-home-profile-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="my-home-profile-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="my-home-sheet-handle" aria-hidden="true" />
            <h2 id="my-home-profile-title">프로필 선택</h2>
            <Image
              className="my-home-profile-preview"
              src={getAddiProfileAsset(candidateProfileId)}
              alt=""
              width={96}
              height={96}
            />
            <div className="my-home-profile-options" role="radiogroup" aria-label="ADDI 프로필">
              {ADDI_PROFILES.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  className={candidateProfileId === profile.id ? "selected" : ""}
                  role="radio"
                  aria-checked={candidateProfileId === profile.id}
                  aria-label={profile.label}
                  onClick={() => setCandidateProfileId(profile.id)}
                >
                  <Image src={profile.asset} alt="" width={56} height={56} />
                </button>
              ))}
            </div>
            <div className="my-home-profile-actions">
              <button type="button" className="cancel" onClick={closeProfileSheet} disabled={busy}>
                닫기
              </button>
              <button type="button" className="confirm" onClick={() => void saveProfile()} disabled={busy}>
                {busy ? "저장 중" : "선택"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {deleteDialogOpen ? (
        <VisitDialog
          title="정말 탈퇴하시겠어요?"
          description="탈퇴하면 계정이 삭제되고 복구할 수 없습니다."
          cancelLabel="취소"
          confirmLabel="탈퇴"
          onCancel={() => setDeleteDialogOpen(false)}
          onConfirm={() => router.push("/my/delete-account")}
        />
      ) : null}
    </MobileShell>
  );
}
