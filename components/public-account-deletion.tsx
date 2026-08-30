"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MobileShell } from "@/components/mobile-shell";
import { FlowHeader } from "@/components/flow-ui";
import { VisitDialog } from "@/components/visit-dialog";
import { clearDeletedAccountLocalData } from "@/lib/account-deletion-local";
import { trackLoginStarted } from "@/lib/analytics/events";
import {
  clearDeletedAccountSession,
  signInWithGoogle,
  signInWithKakao,
} from "@/lib/auth/client";

const DELETE_ACCOUNT_PATH = "/delete-account";
const DELETED_DATA = [
  "ADDI 회원 계정",
  "등록한 약 정보",
  "복용 기록",
  "감정 및 상태 기록",
  "감정 AI 분석 결과",
  "내원 일정",
  "계정과 연결된 피드백",
  "기타 계정과 연결된 ADDI 데이터",
  "현재 브라우저에 저장된 ADDI 관련 사용자 기록",
] as const;

type LoginProvider = "google" | "kakao";

type PublicAccountDeletionProps = {
  configured: boolean;
  isAuthenticated: boolean;
};

export function PublicAccountDeletion({
  configured,
  isAuthenticated,
}: PublicAccountDeletionProps) {
  const router = useRouter();
  const [busyProvider, setBusyProvider] = useState<LoginProvider | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState("");

  async function handleSignIn(provider: LoginProvider) {
    if (!configured || busyProvider) return;
    setBusyProvider(provider);
    setError("");

    try {
      trackLoginStarted();
      if (provider === "google") await signInWithGoogle(DELETE_ACCOUNT_PATH);
      else await signInWithKakao(DELETE_ACCOUNT_PATH);
    } catch {
      setError("로그인을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.");
      setBusyProvider(null);
    }
  }

  async function handleDeleteAccount() {
    if (deleting) return;
    setDeleting(true);
    setError("");

    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      });
      if (!response.ok) throw new Error("account_delete_failed");

      await Promise.allSettled([
        clearDeletedAccountLocalData(),
        clearDeletedAccountSession(),
      ]);
      setDeleteDialogOpen(false);
      setDeleted(true);
      router.refresh();
    } catch {
      setDeleteDialogOpen(false);
      setError("계정 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setDeleting(false);
    }
  }

  return (
    <MobileShell className="legal-screen account-deletion-screen" aria-busy={deleting}>
      <FlowHeader title="ADDI 계정 삭제" fallbackHref="/" />

      <article className="legal-content account-deletion-content">
        <div className="legal-intro">
          <h1>ADDI 계정 삭제</h1>
          <p>ADDI 이용자는 언제든지 계정과 관련 데이터를 삭제할 수 있습니다.</p>
          <dl className="account-deletion-service">
            <div><dt>서비스명</dt><dd>ADDI(아디)</dd></div>
            <div><dt>운영자</dt><dd>kalummy</dd></div>
          </dl>
        </div>

        <div className="legal-sections account-deletion-sections">
          <section>
            <h2>1. 웹에서 계정 삭제</h2>
            <p><strong>삭제되는 데이터</strong></p>
            <ul>
              {DELETED_DATA.map((item) => <li key={item}>{item}</li>)}
            </ul>
            {deleted ? (
              <p className="account-deletion-success" role="status">
                ADDI 계정이 삭제되었습니다.
              </p>
            ) : isAuthenticated ? (
              <div className="account-deletion-authenticated">
                <p className="account-deletion-warning">
                  계정을 삭제하면 ADDI에 저장된 기록을 복구할 수 없습니다.
                </p>
                {error ? <p className="account-deletion-error" role="alert">{error}</p> : null}
                <button
                  type="button"
                  className="account-deletion-delete-button"
                  disabled={deleting}
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  계정 삭제
                </button>
              </div>
            ) : (
              <div className="account-deletion-login">
                <p>계정 삭제를 위해 먼저 로그인해주세요.</p>
                {!configured ? (
                  <p className="account-deletion-error" role="status">
                    로그인 기능을 준비 중입니다. 잠시 후 다시 시도해주세요.
                  </p>
                ) : null}
                {error ? <p className="account-deletion-error" role="alert">{error}</p> : null}
                <div className="account-deletion-login-buttons">
                  <button
                    type="button"
                    className="member-login-button google"
                    disabled={!configured || Boolean(busyProvider)}
                    aria-busy={busyProvider === "google"}
                    onClick={() => void handleSignIn("google")}
                  >
                    <Image src="/auth/google.svg" alt="" width={40} height={40} />
                    <span>{busyProvider === "google" ? "연결 중" : "Google로 계속하기"}</span>
                  </button>
                  <button
                    type="button"
                    className="member-login-button kakao"
                    disabled={!configured || Boolean(busyProvider)}
                    aria-busy={busyProvider === "kakao"}
                    onClick={() => void handleSignIn("kakao")}
                  >
                    <Image src="/auth/kakao.svg" alt="" width={40} height={40} />
                    <span>{busyProvider === "kakao" ? "연결 중" : "카카오로 계속하기"}</span>
                  </button>
                </div>
              </div>
            )}
          </section>

          <section>
            <h2>2. 앱에서 삭제하는 방법</h2>
            <ol>
              <li>ADDI에 로그인</li>
              <li>하단 마이홈 이동</li>
              <li>회원탈퇴 선택</li>
              <li>안내에 따라 계정 삭제 완료</li>
            </ol>
          </section>

          <section>
            <h2>3. 삭제 및 보관 안내</h2>
            <p>
              회원탈퇴가 완료되면 ADDI가 직접 관리하는 계정 및 연결된 사용자 데이터가 삭제됩니다.
            </p>
            <p>
              다만 관련 법령에 따라 보관이 필요한 정보, 백업, 보안 로그 또는 외부 처리 서비스의 기술적 기록은 관련 법령 또는 각 서비스의 보유 정책에 따라 일정 기간 잔존할 수 있습니다.
            </p>
            <p>
              개인정보의 구체적인 처리 내용은 <Link href="/privacy">개인정보처리방침</Link>에서 확인할 수 있습니다.
            </p>
          </section>

          <section>
            <h2>4. 문의</h2>
            <dl className="account-deletion-contact">
              <div><dt>서비스명</dt><dd>ADDI(아디)</dd></div>
              <div><dt>운영자</dt><dd>kalummy</dd></div>
              <div><dt>이메일</dt><dd><a href="mailto:kalummy0427@kakao.com">kalummy0427@kakao.com</a></dd></div>
            </dl>
          </section>
        </div>
      </article>

      {deleteDialogOpen ? (
        <VisitDialog
          title="계정을 삭제할까요?"
          description="삭제된 계정과 기록은 복구할 수 없습니다."
          cancelLabel="취소"
          confirmLabel={deleting ? "삭제 중" : "계정 삭제"}
          onCancel={() => setDeleteDialogOpen(false)}
          onConfirm={() => void handleDeleteAccount()}
          busy={deleting}
        />
      ) : null}
    </MobileShell>
  );
}
