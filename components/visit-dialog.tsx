"use client";

import { useEffect, useRef, type ReactNode } from "react";

type VisitDialogProps = {
  title: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
  replayPublicActions?: boolean;
};

export function VisitDialog({
  title,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  busy = false,
  replayPublicActions = false,
}: VisitDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  onCancelRef.current = onCancel;
  busyRef.current = busy;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    cancelButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        onCancelRef.current();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), [href], input:not(:disabled)") ?? [],
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
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
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  return (
    <div className="visit-dialog-layer" role="presentation">
      <section
        ref={dialogRef}
        className="visit-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="visit-dialog-title"
      >
        <h2 id="visit-dialog-title">{title}</h2>
        <div className="visit-dialog-actions">
          <button
            ref={cancelButtonRef}
            type="button"
            className="cancel"
            onClick={onCancel}
            disabled={busy}
            data-mp-replay-allow-interaction={replayPublicActions ? "" : undefined}
            data-mp-replay-public={replayPublicActions ? "" : undefined}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="confirm"
            onClick={onConfirm}
            disabled={busy}
            data-mp-replay-allow-interaction={replayPublicActions ? "" : undefined}
            data-mp-replay-public={replayPublicActions ? "" : undefined}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
