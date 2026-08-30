"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
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
import { unsubscribeFromPush } from "@/lib/push/client";
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

const PROFILE_SHEET_CLOSE_DURATION_MS = 240;
const PROFILE_SHEET_DRAG_DISMISS_RATIO = 0.28;
const PROFILE_SHEET_FLICK_DISMISS_VELOCITY = 0.8;
const PROFILE_SHEET_FLICK_MIN_DISTANCE = 24;

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
  const dragHandleRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const enterFrameRef = useRef<number | null>(null);
  const closingRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const busyRef = useRef(false);
  const profileIdRef = useRef(initialProfileId);
  const dragRef = useRef<{
    source: "pointer" | "touch";
    id: number;
    startY: number;
    lastY: number;
    lastTime: number;
    velocity: number;
    offset: number;
  } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileEntered, setProfileEntered] = useState(false);
  const [profileClosing, setProfileClosing] = useState(false);
  const [profileDragging, setProfileDragging] = useState(false);
  const [profileDragOffset, setProfileDragOffset] = useState(0);
  const [profileId, setProfileId] = useState(initialProfileId);
  const [candidateProfileId, setCandidateProfileId] = useState(initialProfileId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const requestProfileClose = useCallback(({
    afterClose,
    resetCandidate = true,
    force = false,
  }: {
    afterClose?: () => void;
    resetCandidate?: boolean;
    force?: boolean;
  } = {}) => {
    if ((!force && busyRef.current) || closingRef.current) return;
    closingRef.current = true;

    const finish = () => {
      if (resetCandidate) setCandidateProfileId(profileIdRef.current);
      setProfileOpen(false);
      setProfileEntered(false);
      setProfileClosing(false);
      setProfileDragging(false);
      setProfileDragOffset(0);
      dragRef.current = null;
      closingRef.current = false;
      closeTimerRef.current = null;
      afterClose?.();
    };

    if (reducedMotionRef.current) {
      finish();
      return;
    }

    setProfileDragging(false);
    setProfileClosing(true);
    closeTimerRef.current = window.setTimeout(finish, PROFILE_SHEET_CLOSE_DURATION_MS);
  }, []);

  const startProfileDrag = useCallback((
    source: "pointer" | "touch",
    id: number,
    y: number,
    time: number,
  ) => {
    if (busyRef.current || closingRef.current) return;
    dragRef.current = {
      source,
      id,
      startY: y,
      lastY: y,
      lastTime: time,
      velocity: 0,
      offset: 0,
    };
    setProfileDragging(true);
  }, []);

  const moveProfileDrag = useCallback((
    source: "pointer" | "touch",
    id: number,
    y: number,
    time: number,
  ) => {
    const drag = dragRef.current;
    if (!drag || drag.source !== source || drag.id !== id) return false;

    const nextOffset = Math.max(0, y - drag.startY);
    const elapsed = Math.max(1, time - drag.lastTime);
    drag.velocity = (y - drag.lastY) / elapsed;
    drag.lastY = y;
    drag.lastTime = time;
    drag.offset = nextOffset;
    setProfileDragOffset(nextOffset);
    return nextOffset > 0;
  }, []);

  const finishProfileDrag = useCallback((
    source: "pointer" | "touch",
    id: number,
    cancelled = false,
  ) => {
    const drag = dragRef.current;
    if (!drag || drag.source !== source || drag.id !== id) return;
    dragRef.current = null;

    const sheetHeight = sheetRef.current?.getBoundingClientRect().height ?? 396;
    const dismissByDistance = drag.offset >= sheetHeight * PROFILE_SHEET_DRAG_DISMISS_RATIO;
    const dismissByFlick = drag.offset >= PROFILE_SHEET_FLICK_MIN_DISTANCE
      && drag.velocity >= PROFILE_SHEET_FLICK_DISMISS_VELOCITY;

    if (!cancelled && (dismissByDistance || dismissByFlick)) {
      requestProfileClose();
      return;
    }

    setProfileDragging(false);
    setProfileDragOffset(0);
  }, [requestProfileClose]);

  useEffect(() => {
    if (!profileOpen) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const dialog = sheetRef.current;
    const focusable = () => Array.from(
      dialog?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    dialog?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        requestProfileClose();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!items.includes(document.activeElement as HTMLElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [profileOpen, requestProfileClose]);

  useEffect(() => {
    if (!profileOpen) return;
    const currentDragHandle = dragHandleRef.current;
    if (!currentDragHandle) return;
    const dragHandle: HTMLDivElement = currentDragHandle;
    const supportsPointerEvents = "PointerEvent" in window;

    function touchById(touches: TouchList, id: number) {
      return Array.from(touches).find((touch) => touch.identifier === id);
    }

    function handleTouchStart(event: TouchEvent) {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      event.preventDefault();
      startProfileDrag("touch", touch.identifier, touch.clientY, event.timeStamp);
    }

    function handleTouchMove(event: TouchEvent) {
      const drag = dragRef.current;
      if (!drag || drag.source !== "touch") return;
      const touch = touchById(event.touches, drag.id);
      if (!touch) return;
      if (moveProfileDrag("touch", drag.id, touch.clientY, event.timeStamp)) {
        event.preventDefault();
      }
    }

    function handleTouchEnd(event: TouchEvent) {
      const drag = dragRef.current;
      if (!drag || drag.source !== "touch") return;
      if (touchById(event.changedTouches, drag.id)) finishProfileDrag("touch", drag.id);
    }

    function handleTouchCancel() {
      const drag = dragRef.current;
      if (drag?.source === "touch") finishProfileDrag("touch", drag.id, true);
    }

    function handlePointerDown(event: PointerEvent) {
      if (!event.isPrimary || busyRef.current || closingRef.current) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      try {
        dragHandle.setPointerCapture(event.pointerId);
      } catch {
        // Window listeners below keep the drag continuous when capture is unavailable.
      }
      startProfileDrag("pointer", event.pointerId, event.clientY, event.timeStamp);
    }

    function handlePointerMove(event: PointerEvent) {
      if (moveProfileDrag("pointer", event.pointerId, event.clientY, event.timeStamp)) {
        event.preventDefault();
      }
    }

    function handlePointerEnd(event: PointerEvent, cancelled = false) {
      finishProfileDrag("pointer", event.pointerId, cancelled);
      if (dragHandle.hasPointerCapture(event.pointerId)) {
        dragHandle.releasePointerCapture(event.pointerId);
      }
    }

    function handlePointerCancel(event: PointerEvent) {
      handlePointerEnd(event, true);
    }

    if (supportsPointerEvents) {
      dragHandle.addEventListener("pointerdown", handlePointerDown);
      window.addEventListener("pointermove", handlePointerMove, { passive: false });
      window.addEventListener("pointerup", handlePointerEnd);
      window.addEventListener("pointercancel", handlePointerCancel);
    } else {
      dragHandle.addEventListener("touchstart", handleTouchStart, { passive: false });
      window.addEventListener("touchmove", handleTouchMove, { passive: false });
      window.addEventListener("touchend", handleTouchEnd);
      window.addEventListener("touchcancel", handleTouchCancel);
    }
    return () => {
      if (supportsPointerEvents) {
        dragHandle.removeEventListener("pointerdown", handlePointerDown);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerEnd);
        window.removeEventListener("pointercancel", handlePointerCancel);
      } else {
        dragHandle.removeEventListener("touchstart", handleTouchStart);
        window.removeEventListener("touchmove", handleTouchMove);
        window.removeEventListener("touchend", handleTouchEnd);
        window.removeEventListener("touchcancel", handleTouchCancel);
      }
    };
  }, [finishProfileDrag, moveProfileDrag, profileOpen, startProfileDrag]);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    if (enterFrameRef.current !== null) window.cancelAnimationFrame(enterFrameRef.current);
  }, []);

  function openProfileSheet() {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    if (enterFrameRef.current !== null) window.cancelAnimationFrame(enterFrameRef.current);
    closingRef.current = false;
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setCandidateProfileId(profileId);
    setError("");
    setProfileClosing(false);
    setProfileDragging(false);
    setProfileDragOffset(0);
    setProfileEntered(reducedMotionRef.current);
    setProfileOpen(true);
    if (!reducedMotionRef.current) {
      enterFrameRef.current = window.requestAnimationFrame(() => {
        enterFrameRef.current = window.requestAnimationFrame(() => setProfileEntered(true));
      });
    }
  }

  function closeProfileSheet() {
    requestProfileClose();
  }

  async function saveProfile() {
    if (busy) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await updateAddiProfile(candidateProfileId);
      profileIdRef.current = candidateProfileId;
      setProfileId(candidateProfileId);
      requestProfileClose({
        afterClose: () => router.refresh(),
        resetCandidate: false,
        force: true,
      });
    } catch {
      setError("프로필을 저장하지 못했어요. 다시 시도해주세요.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const profileDragProgress = Math.min(1, profileDragOffset / 396);
  const profileSheetStyle: CSSProperties = {
    transform: profileClosing
      ? "translate3d(0, 100%, 0)"
      : profileDragging || profileDragOffset > 0
        ? `translate3d(0, ${profileDragOffset}px, 0)`
        : profileEntered
          ? "translate3d(0, 0, 0)"
          : "translate3d(0, 100%, 0)",
    transition: profileDragging
      ? "none"
      : `transform ${PROFILE_SHEET_CLOSE_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
    pointerEvents: profileClosing ? "none" : undefined,
  };
  const profileDimmedStyle: CSSProperties = {
    opacity: profileClosing || !profileEntered ? 0 : 1 - profileDragProgress,
    transition: profileDragging
      ? "none"
      : `opacity ${PROFILE_SHEET_CLOSE_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
  };

  async function handleSignOut() {
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      await restoreClaimedGuestDatasetVisibilityForUser(userId);
      await unsubscribeFromPush().catch(() => undefined);
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
        <div className="my-home-sheet-layer" role="presentation">
          <button
            type="button"
            className="my-home-sheet-dimmed"
            aria-label="프로필 선택 닫기"
            style={profileDimmedStyle}
            onClick={closeProfileSheet}
          />
          <section
            ref={sheetRef}
            className="my-home-profile-sheet"
            role="dialog"
            tabIndex={-1}
            aria-modal="true"
            aria-labelledby="my-home-profile-title"
            style={profileSheetStyle}
          >
            <div ref={dragHandleRef} className="my-home-sheet-drag-handle">
              <div className="my-home-sheet-handle" aria-hidden="true" />
            </div>
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
