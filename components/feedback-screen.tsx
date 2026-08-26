"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PrimaryButton } from "@/components/flow-ui";
import { MobileShell } from "@/components/mobile-shell";
import { VisitDialog } from "@/components/visit-dialog";
import { createClientId } from "@/lib/client-id";
import { FEEDBACK_MAX_LENGTH, normalizeFeedbackText } from "@/lib/feedback";

const FEEDBACK_SUCCESS_MESSAGE = "sent";
const FEEDBACK_DRAFT_SESSION_KEY = "addi:feedback:draft";
const FEEDBACK_EXIT_SESSION_KEY = "addi:feedback:exit-requested";

export function FeedbackScreen() {
  const router = useRouter();
  const [feedbackText, setFeedbackText] = useState("");
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);
  const feedbackTextRef = useRef(feedbackText);
  const submittingRef = useRef(false);
  const allowNavigationRef = useRef(false);
  const historyGuardInstalledRef = useRef(false);
  feedbackTextRef.current = feedbackText;

  const normalizedFeedback = normalizeFeedbackText(feedbackText);
  const hasDraft = feedbackText.length > 0;

  useLayoutEffect(() => {
    try {
      const savedDraft = window.sessionStorage.getItem(FEEDBACK_DRAFT_SESSION_KEY) ?? "";
      if (savedDraft) {
        feedbackTextRef.current = savedDraft;
        setFeedbackText(savedDraft);
      }
      if (window.sessionStorage.getItem(FEEDBACK_EXIT_SESSION_KEY) === "1") {
        setShowExitDialog(true);
      }
    } catch {
      // The in-memory draft still works if sessionStorage is unavailable.
    }
  }, []);

  useEffect(() => {
    if (!historyGuardInstalledRef.current) {
      historyGuardInstalledRef.current = true;
      if (!window.history.state?.addiFeedbackGuard) {
        window.history.pushState(
          { ...window.history.state, addiFeedbackGuard: true },
          "",
          window.location.href,
        );
      }
    }

    const handlePopState = () => {
      if (allowNavigationRef.current) return;
      if (!feedbackTextRef.current.length) {
        allowNavigationRef.current = true;
        router.replace("/");
        return;
      }
      try {
        window.sessionStorage.setItem(FEEDBACK_EXIT_SESSION_KEY, "1");
      } catch {
        // The guard still prevents navigation even without sessionStorage.
      }
      window.history.pushState(
        { ...window.history.state, addiFeedbackGuard: true },
        "",
        "/feedback",
      );
      setShowExitDialog(true);
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowNavigationRef.current || !feedbackTextRef.current.length) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  function leaveFeedback(target = "/") {
    allowNavigationRef.current = true;
    try {
      window.sessionStorage.removeItem(FEEDBACK_DRAFT_SESSION_KEY);
      window.sessionStorage.removeItem(FEEDBACK_EXIT_SESSION_KEY);
    } catch {
      // Navigation still completes if sessionStorage is unavailable.
    }
    const finishNavigation = () => router.replace(target);
    window.addEventListener("popstate", finishNavigation, { once: true });
    window.history.back();
    window.setTimeout(() => {
      if (window.location.pathname === "/feedback") finishNavigation();
    }, 250);
  }

  function handleClose() {
    if (hasDraft) {
      setShowExitDialog(true);
      return;
    }
    leaveFeedback();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!normalizedFeedback || submittingRef.current) return;

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitFailed(false);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackText: normalizedFeedback }),
      });
      if (!response.ok) throw new Error("feedback_submission_failed");

      const toastId = createClientId();
      leaveFeedback(
        `/?feedbackToast=${FEEDBACK_SUCCESS_MESSAGE}&toastId=${encodeURIComponent(toastId)}`,
      );
    } catch {
      submittingRef.current = false;
      setSubmitting(false);
      setSubmitFailed(true);
    }
  }

  return (
    <MobileShell className="feedback-screen">
      <header className="feedback-header">
        <strong>의견 보내기</strong>
        <button type="button" onClick={handleClose} aria-label="의견 보내기 닫기">
          <Image src="/icons/close.svg" alt="" width={14} height={14} />
        </button>
      </header>

      <section className="feedback-intro">
        <h1>아디를 이용해보고 어떠셨나요?</h1>
        <p>사용하면서 불편했던 점이나<br />필요한 기능이 있다면 편하게 알려주세요.</p>
      </section>

      <form className="feedback-form" onSubmit={handleSubmit}>
        <label className="feedback-textarea-shell">
          <span className="sr-only">의견 내용</span>
          <textarea
            className="feedback-private-input"
            value={feedbackText}
            maxLength={FEEDBACK_MAX_LENGTH}
            placeholder="작성한 의견은 서비스 개선을 위해 활용됩니다."
            onChange={(event) => {
              const nextFeedbackText = event.target.value;
              feedbackTextRef.current = nextFeedbackText;
              setFeedbackText(nextFeedbackText);
              try {
                if (nextFeedbackText) {
                  window.sessionStorage.setItem(FEEDBACK_DRAFT_SESSION_KEY, nextFeedbackText);
                } else {
                  window.sessionStorage.removeItem(FEEDBACK_DRAFT_SESSION_KEY);
                }
              } catch {
                // The controlled textarea continues to retain the in-memory value.
              }
              if (submitFailed) setSubmitFailed(false);
            }}
          />
        </label>

        <div className="feedback-actions">
          <span className="sr-only" role="status" aria-live="polite">
            {submitFailed ? "의견을 보내지 못했습니다. 다시 시도해 주세요." : ""}
          </span>
          <PrimaryButton
            type="submit"
            disabled={!normalizedFeedback || submitting}
            aria-busy={submitting}
          >
            의견 보내기
          </PrimaryButton>
        </div>
      </form>

      {showExitDialog ? (
        <VisitDialog
          title="작성하신 내용을 지울까요?"
          description="내용을 지우면 다시 작성해야해요"
          cancelLabel="취소"
          confirmLabel="지우기"
          onCancel={() => {
            try {
              window.sessionStorage.removeItem(FEEDBACK_EXIT_SESSION_KEY);
            } catch {
              // The dialog still closes if sessionStorage is unavailable.
            }
            setShowExitDialog(false);
          }}
          onConfirm={() => leaveFeedback()}
        />
      ) : null}
    </MobileShell>
  );
}
