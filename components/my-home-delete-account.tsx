"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MobileShell } from "@/components/mobile-shell";
import { MyHomeSubheader } from "@/components/my-home-subheader";
import {
  completeDeletedAccountCleanup,
  getPendingDeletedAccountCleanup,
  retryDeletedAccountCleanup,
} from "@/lib/auth/client";

const DELETE_REASONS = [
  "기록하는 게 번거로워요",
  "자주 사용하지 않아요",
  "필요한 기능이 부족해요",
  "사용하기 불편해요",
  "직접 입력할게요",
] as const;

type DeleteReason = (typeof DELETE_REASONS)[number];
const CUSTOM_REASON: DeleteReason = "직접 입력할게요";

export function MyHomeDeleteAccount() {
  const router = useRouter();
  const [reason, setReason] = useState<DeleteReason | null>(null);
  const [customReason, setCustomReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [serverDeleted, setServerDeleted] = useState(false);
  const [cleanupPending, setCleanupPending] = useState(false);
  const operationInFlight = useRef(false);
  const serverDeletedRef = useRef(false);
  const recoveryCompleteRef = useRef(false);
  const canSubmit = Boolean(
    !busy && (
      cleanupPending || serverDeleted
      || (reason && (reason !== CUSTOM_REASON || customReason.trim()))
    ),
  );

  useEffect(() => {
    // A recovery hint permits local cleanup only, never another server DELETE.
    if (getPendingDeletedAccountCleanup()) setCleanupPending(true);
  }, []);

  useEffect(() => {
    if (!busy) return;

    const keepDeletionScreenOpen = () => window.history.forward();
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("popstate", keepDeletionScreenOpen);
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => {
      window.removeEventListener("popstate", keepDeletionScreenOpen);
      window.removeEventListener("beforeunload", warnBeforeLeaving);
    };
  }, [busy]);

  function selectReason(nextReason: DeleteReason) {
    setReason(nextReason);
    setError("");
    if (nextReason !== CUSTOM_REASON) setCustomReason("");
  }

  async function handleDeleteRequest() {
    const recoveryPending = getPendingDeletedAccountCleanup();
    if (busy || operationInFlight.current || recoveryCompleteRef.current
      || (!canSubmit && !recoveryPending)) return;
    operationInFlight.current = true;
    setBusy(true);
    setError("");

    try {
      const localOnly = cleanupPending || serverDeletedRef.current || recoveryPending;
      if (!localOnly) {
        const response = await fetch("/api/account", {
          method: "DELETE",
          cache: "no-store",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
        });
        if (!response.ok) throw new Error("account_delete_failed");
        serverDeletedRef.current = true;
        setServerDeleted(true);
      }

      const result = localOnly
        ? await retryDeletedAccountCleanup()
        : await completeDeletedAccountCleanup();
      if (result.status !== "complete") {
        setCleanupPending(true);
        setError(serverDeletedRef.current
          ? "계정 삭제는 처리됐지만 이 기기의 정보 정리가 남아 있어요. 다시 시도해주세요."
          : "이 기기의 정보 정리가 아직 완료되지 않았어요. 다시 시도해주세요.");
        return;
      }

      setCleanupPending(false);
      if (!serverDeletedRef.current) recoveryCompleteRef.current = true;
      router.replace("/auth/login");
      router.refresh();
    } catch {
      if (serverDeletedRef.current || cleanupPending || recoveryPending) {
        setCleanupPending(true);
        setError(serverDeletedRef.current
          ? "계정 삭제는 처리됐지만 이 기기의 정보 정리가 남아 있어요. 다시 시도해주세요."
          : "이 기기의 정보 정리가 아직 완료되지 않았어요. 다시 시도해주세요.");
      } else {
        setError("계정 삭제 결과를 확인하지 못했어요. 잠시 후 다시 시도해주세요.");
      }
    } finally {
      operationInFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <MobileShell
      className={`my-home-detail-screen my-home-delete-screen${busy ? " deleting" : ""}`}
      aria-busy={busy}
    >
      <MyHomeSubheader title="회원탈퇴" />

      <section className="my-home-delete-heading">
        <h1>{cleanupPending ? "기기 정보 정리가 남아 있어요" : "아디를 떠나시는 이유는 무엇인가요?"}</h1>
        {cleanupPending ? (
          <p>다시 시도하면 이 기기의 정보만 정리해요.</p>
        ) : (
          <p>보내주신 의견을 통해<br />더 나은 서비스로 다시 찾아뵙겠습니다.</p>
        )}
      </section>

      {!cleanupPending && !serverDeleted ? <fieldset className="my-home-delete-options">
        <legend className="sr-only">탈퇴 사유</legend>
        {DELETE_REASONS.map((option) => {
          const selected = reason === option;
          const custom = option === CUSTOM_REASON;
          return (
            <div className={`my-home-delete-option${selected ? " selected" : ""}${custom ? " custom" : ""}`} key={option}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={busy}
                onClick={() => selectReason(option)}
              >
                <Image
                  src={selected ? "/icons/radio-selected.svg" : "/icons/radio-default-outer.svg"}
                  alt=""
                  width={20}
                  height={20}
                />
                <span>{option}</span>
              </button>
              {custom && selected ? (
                <textarea
                  value={customReason}
                  aria-label="탈퇴 사유 직접 입력"
                  disabled={busy}
                  onChange={(event) => {
                    setCustomReason(event.target.value);
                    setError("");
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </fieldset> : null}

      <div className="my-home-delete-actions">
        {error ? <p className="my-home-detail-error" role="alert">{error}</p> : null}
        <Link
          href="/my"
          className="continue"
          aria-disabled={busy || cleanupPending || serverDeleted}
          onClick={(event) => {
            if (busy || cleanupPending || serverDeleted) event.preventDefault();
          }}
        >
          계속 이용하기
        </Link>
        <button type="button" className="delete" disabled={!canSubmit} onClick={handleDeleteRequest}>
          {busy ? "처리 중" : cleanupPending || serverDeleted ? "기기 정보 정리 다시 시도" : "탈퇴하기"}
        </button>
      </div>
    </MobileShell>
  );
}
