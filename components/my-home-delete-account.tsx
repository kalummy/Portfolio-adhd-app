"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MobileShell } from "@/components/mobile-shell";
import { MyHomeSubheader } from "@/components/my-home-subheader";
import { clearDeletedAccountSession } from "@/lib/auth/client";
import { clearDeletedAccountLocalData } from "@/lib/account-deletion-local";

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
  const canSubmit = Boolean(
    !busy && reason && (reason !== CUSTOM_REASON || customReason.trim()),
  );

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
    if (!canSubmit || busy) return;
    setBusy(true);
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
      router.replace("/auth/login");
      router.refresh();
    } catch {
      setError("탈퇴 처리에 실패했어요. 잠시 후 다시 시도해주세요.");
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
        <h1>아디를 떠나시는 이유는 무엇인가요?</h1>
        <p>보내주신 의견을 통해<br />더 나은 서비스로 다시 찾아뵙겠습니다.</p>
      </section>

      <fieldset className="my-home-delete-options">
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
      </fieldset>

      <div className="my-home-delete-actions">
        {error ? <p className="my-home-detail-error" role="alert">{error}</p> : null}
        <Link
          href="/my"
          className="continue"
          aria-disabled={busy}
          onClick={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          계속 이용하기
        </Link>
        <button type="button" className="delete" disabled={!canSubmit} onClick={handleDeleteRequest}>
          {busy ? "탈퇴 처리 중" : "탈퇴하기"}
        </button>
      </div>
    </MobileShell>
  );
}
