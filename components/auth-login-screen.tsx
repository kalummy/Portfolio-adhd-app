"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MemberBrandLockup, MemberSplash } from "@/components/member-splash";
import { MobileShell } from "@/components/mobile-shell";
import { trackLoginStarted } from "@/lib/analytics/events";
import {
  getAuthState,
  getPendingDeletedAccountCleanup,
  retryDeletedAccountCleanup,
  signInWithGoogle,
  signInWithKakao,
  type AuthState,
} from "@/lib/auth/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const EMPTY_AUTH_STATE: AuthState = { isAuthenticated: false, user: null };
type LoginProvider = "kakao" | "google";

export function AuthLoginScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authState, setAuthState] = useState<AuthState>(EMPTY_AUTH_STATE);
  const [authChecked, setAuthChecked] = useState(false);
  const [splashComplete, setSplashComplete] = useState(false);
  const [busyProvider, setBusyProvider] = useState<LoginProvider | null>(null);
  const [error, setError] = useState("");
  const [cleanupPending, setCleanupPending] = useState(false);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const cleanupInFlight = useRef(false);
  const authCheckGeneration = useRef(0);
  const configured = isSupabaseConfigured();
  const nextPath = "/";

  useEffect(() => {
    const generation = ++authCheckGeneration.current;
    if (getPendingDeletedAccountCleanup()) {
      setCleanupPending(true);
      setAuthState(EMPTY_AUTH_STATE);
      setAuthChecked(true);
      return;
    }
    if (!configured) {
      setAuthChecked(true);
      return;
    }

    let active = true;
    void getAuthState()
      .then((state) => {
        if (!active || generation !== authCheckGeneration.current) return;
        if (getPendingDeletedAccountCleanup()) {
          setCleanupPending(true);
          setAuthState(EMPTY_AUTH_STATE);
        } else setAuthState(state);
      })
      .catch(() => {
        if (active && generation === authCheckGeneration.current) setError("로그인 상태를 확인하지 못했어요.");
      })
      .finally(() => {
        if (active && generation === authCheckGeneration.current) setAuthChecked(true);
      });

    return () => {
      active = false;
    };
  }, [configured]);

  useEffect(() => {
    if (getPendingDeletedAccountCleanup()) return;
    const reason = searchParams.get("error");
    if (reason === "profile") setError("프로필을 준비하지 못했어요. 잠시 후 다시 시도해주세요.");
    else if (reason) setError("로그인을 완료하지 못했어요. 다시 시도해주세요.");
  }, [searchParams]);

  useEffect(() => {
    if (getPendingDeletedAccountCleanup()) {
      authCheckGeneration.current++;
      setCleanupPending(true);
      setAuthState(EMPTY_AUTH_STATE);
      setAuthChecked(true);
      return;
    }
    if (cleanupPending || cleanupBusy || !splashComplete || !authChecked || !authState.isAuthenticated) return;
    router.replace(nextPath);
    router.refresh();
  }, [authChecked, authState.isAuthenticated, cleanupBusy, cleanupPending, nextPath, router, splashComplete]);

  const handleSplashComplete = useCallback(() => setSplashComplete(true), []);

  async function handleSignIn(provider: LoginProvider) {
    if (busyProvider || cleanupBusy || cleanupInFlight.current || !configured) return;
    if (getPendingDeletedAccountCleanup()) {
      authCheckGeneration.current++;
      setCleanupPending(true);
      setAuthState(EMPTY_AUTH_STATE);
      setAuthChecked(true);
      setError("이 기기의 정보 정리가 남아 있어요. 먼저 정리를 다시 시도해주세요.");
      return;
    }
    setBusyProvider(provider);
    setError("");

    try {
      trackLoginStarted();
      if (provider === "kakao") await signInWithKakao(nextPath);
      else await signInWithGoogle(nextPath);
    } catch {
      setError(`${provider === "kakao" ? "카카오" : "Google"} 로그인을 시작하지 못했어요.`);
      setBusyProvider(null);
    }
  }

  async function handleCleanupRetry() {
    if (cleanupInFlight.current || busyProvider) return;
    cleanupInFlight.current = true;
    authCheckGeneration.current++;
    setCleanupBusy(true);
    setAuthState(EMPTY_AUTH_STATE);
    setAuthChecked(true);
    setError("");
    try {
      const result = await retryDeletedAccountCleanup();
      const pending = result.status !== "complete" || getPendingDeletedAccountCleanup();
      setCleanupPending(pending);
      if (pending) setError("이 기기의 정보 정리가 아직 완료되지 않았어요. 다시 시도해주세요.");
    } catch {
      setCleanupPending(true);
      setError("이 기기의 정보 정리를 완료하지 못했어요. 다시 시도해주세요.");
    } finally {
      cleanupInFlight.current = false;
      setCleanupBusy(false);
    }
  }

  if (!cleanupPending && (!splashComplete || !authChecked || authState.isAuthenticated)) {
    return <MemberSplash onComplete={handleSplashComplete} />;
  }

  return (
    <MobileShell className="member-login-screen">
      <MemberBrandLockup />

      <div className="member-login-actions">
        {!configured ? (
          <p className="member-login-error" role="status">
            Supabase 환경변수 설정이 필요해요.
          </p>
        ) : null}
        {cleanupPending ? (
          <p className="member-login-error" role="status">
            {error || "이 기기의 정보 정리가 남아 있어요. 먼저 정리를 다시 시도해주세요."}
          </p>
        ) : error ? <p className="member-login-error" role="alert">{error}</p> : null}

        <button
          type="button"
          className="member-login-button kakao"
          disabled={!configured || Boolean(busyProvider) || cleanupPending || cleanupBusy}
          aria-busy={busyProvider === "kakao"}
          onClick={() => void handleSignIn("kakao")}
        >
          <Image src="/auth/kakao.svg" alt="" width={40} height={40} />
          <span>{busyProvider === "kakao" ? "연결 중" : "카카오로 시작"}</span>
        </button>
        <button
          type="button"
          className="member-login-button google"
          disabled={!configured || Boolean(busyProvider) || cleanupPending || cleanupBusy}
          aria-busy={busyProvider === "google"}
          onClick={() => void handleSignIn("google")}
        >
          <Image src="/auth/google.svg" alt="" width={40} height={40} />
          <span>{busyProvider === "google" ? "연결 중" : "구글로 시작"}</span>
        </button>
        {cleanupPending ? (
          <button
            type="button"
            className="member-login-button"
            disabled={cleanupBusy || Boolean(busyProvider)}
            aria-busy={cleanupBusy}
            onClick={() => void handleCleanupRetry()}
          >
            {cleanupBusy ? "기기 정보 정리 중" : "기기 정보 정리 다시 시도"}
          </button>
        ) : null}
      </div>
    </MobileShell>
  );
}
