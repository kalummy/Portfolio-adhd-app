"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { MobileShell } from "@/components/mobile-shell";
import { MyHomeSubheader } from "@/components/my-home-subheader";
import { Toast } from "@/components/toast";
import { VisitDialog } from "@/components/visit-dialog";
import {
  getLinkedOAuthIdentities,
  linkOAuthIdentity,
  unlinkOAuthIdentity,
  type AddiOAuthProvider,
} from "@/lib/auth/client";

const PROVIDERS: ReadonlyArray<{
  id: AddiOAuthProvider;
  label: string;
  logo: string;
}> = [
  { id: "kakao", label: "카카오", logo: "/auth/kakao.svg" },
  { id: "google", label: "구글", logo: "/auth/google.svg" },
];

export function MyHomeSocialLogin() {
  const [linkedProviders, setLinkedProviders] = useState<AddiOAuthProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyProvider, setBusyProvider] = useState<AddiOAuthProvider | null>(null);
  const [confirmProvider, setConfirmProvider] = useState<AddiOAuthProvider | null>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  const loadIdentities = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const identities = await getLinkedOAuthIdentities();
      setLinkedProviders(identities.map((identity) => identity.provider));
    } catch {
      setError("연결된 계정을 확인하지 못했어요. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadIdentities();
  }, [loadIdentities]);

  async function handleConnect(provider: AddiOAuthProvider) {
    if (busyProvider) return;
    setBusyProvider(provider);
    setError("");
    try {
      await linkOAuthIdentity(provider);
    } catch {
      setError("계정 연결을 시작하지 못했어요. 다시 시도해주세요.");
      setBusyProvider(null);
    }
  }

  async function handleUnlink(provider: AddiOAuthProvider) {
    if (busyProvider) return;
    setBusyProvider(provider);
    setError("");
    try {
      await unlinkOAuthIdentity(provider);
      setConfirmProvider(null);
      await loadIdentities();
      const providerLabel = PROVIDERS.find((item) => item.id === provider)?.label ?? "간편 로그인";
      setToast(`${providerLabel} 계정 연결을 해제했어요.`);
    } catch (caughtError) {
      setConfirmProvider(null);
      setError(
        caughtError instanceof Error && caughtError.message === "last_identity"
          ? "마지막 로그인 수단은 연결을 해제할 수 없어요."
          : "계정 연결을 해제하지 못했어요. 다시 시도해주세요.",
      );
    } finally {
      setBusyProvider(null);
    }
  }

  return (
    <MobileShell className="my-home-detail-screen">
      <MyHomeSubheader title="간편 로그인" />

      <section className="my-home-social-content" aria-busy={loading}>
        {loading ? <div className="my-home-social-loading" aria-label="연결 상태 확인 중" /> : null}
        {!loading ? PROVIDERS.map((provider) => {
          const linked = linkedProviders.includes(provider.id);
          const lastIdentity = linked && linkedProviders.length <= 1;
          const busy = busyProvider === provider.id;
          return (
            <div className="my-home-provider-row" key={provider.id}>
              <div className="my-home-provider-copy">
                <Image src={provider.logo} alt="" width={24} height={24} />
                <span>{provider.label}로 연결하기</span>
              </div>
              <button
                type="button"
                className={linked ? "linked" : "connect"}
                disabled={Boolean(busyProvider) || lastIdentity}
                aria-describedby={lastIdentity ? `${provider.id}-last-identity` : undefined}
                onClick={() => {
                  if (linked) setConfirmProvider(provider.id);
                  else void handleConnect(provider.id);
                }}
              >
                {busy ? "처리 중" : linked ? "연결해제" : "연결하기"}
              </button>
              {lastIdentity ? (
                <span id={`${provider.id}-last-identity`} className="sr-only">
                  마지막 로그인 수단이라 연결을 해제할 수 없습니다.
                </span>
              ) : null}
            </div>
          );
        }) : null}
        {error ? <p className="my-home-detail-error" role="alert">{error}</p> : null}
      </section>

      {confirmProvider ? (
        <VisitDialog
          title="간편로그인 연결을 해제할까요?"
          cancelLabel="취소"
          confirmLabel="해제"
          onCancel={() => setConfirmProvider(null)}
          onConfirm={() => void handleUnlink(confirmProvider)}
          busy={Boolean(busyProvider)}
        />
      ) : null}

      {toast ? <Toast message={toast} onDismiss={() => setToast("")} /> : null}
    </MobileShell>
  );
}
