"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FlowHeader, PrimaryButton } from "@/components/flow-ui";
import { MobileShell } from "@/components/mobile-shell";
import { getAuthState, signInWithGoogle, signOut, type AuthState } from "@/lib/auth/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const EMPTY_AUTH_STATE: AuthState = { isAuthenticated: false, user: null };

export function AuthLoginScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authState, setAuthState] = useState<AuthState>(EMPTY_AUTH_STATE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    let active = true;
    void getAuthState()
      .then((state) => {
        if (active) setAuthState(state);
      })
      .catch(() => {
        if (active) setError("로그인 상태를 확인하지 못했어요.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [configured]);

  useEffect(() => {
    const reason = searchParams.get("error");
    if (reason === "profile") setError("프로필을 준비하지 못했어요. 잠시 후 다시 시도해주세요.");
    else if (reason) setError("Google 로그인을 완료하지 못했어요. 다시 시도해주세요.");
  }, [searchParams]);

  async function handleSignIn() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await signInWithGoogle("/");
    } catch {
      setError("Google 로그인을 시작하지 못했어요.");
      setBusy(false);
    }
  }

  async function handleSignOut() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await signOut();
      setAuthState(EMPTY_AUTH_STATE);
      router.replace("/");
      router.refresh();
    } catch {
      setError("로그아웃하지 못했어요. 다시 시도해주세요.");
      setBusy(false);
    }
  }

  return (
    <MobileShell className="flow-screen auth-screen">
      <FlowHeader title="계정" fallbackHref="/" />
      <section className="flow-content auth-content">
        <h1>{authState.isAuthenticated ? "Google 계정으로 로그인했어요" : "기록을 안전하게 보관해요"}</h1>
        <p>
          {authState.isAuthenticated
            ? authState.user?.email ?? "로그인된 사용자"
            : "로그인하지 않아도 지금처럼 모든 기본 기능을 사용할 수 있어요."}
        </p>

        {!configured ? (
          <p className="auth-message" role="status">Supabase 환경변수 설정이 필요해요.</p>
        ) : null}
        {error ? <p className="auth-message error" role="alert">{error}</p> : null}

        {!loading ? (
          <PrimaryButton
            type="button"
            variant={authState.isAuthenticated ? "secondary" : "primary"}
            disabled={busy || !configured}
            aria-busy={busy}
            onClick={() => void (authState.isAuthenticated ? handleSignOut() : handleSignIn())}
          >
            {busy
              ? "처리 중..."
              : authState.isAuthenticated
                ? "로그아웃"
                : "Google로 계속하기"}
          </PrimaryButton>
        ) : (
          <div className="auth-loading" aria-label="로그인 상태 확인 중" />
        )}
      </section>
    </MobileShell>
  );
}
