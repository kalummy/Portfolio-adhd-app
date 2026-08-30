"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

type VisitDialogProps = {
  title: ReactNode;
  description?: ReactNode;
  cancelLabel?: string;
  confirmLabel: string;
  onCancel?: () => void;
  onConfirm: () => void;
  busy?: boolean;
  className?: string;
  layerClassName?: string;
};

export function VisitDialog({
  title,
  description,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  busy = false,
  className = "",
  layerClassName = "",
}: VisitDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  onCancelRef.current = onCancel;
  busyRef.current = busy;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    (cancelButtonRef.current ?? confirmButtonRef.current)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current && onCancelRef.current) {
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
    <div className={`visit-dialog-layer ${layerClassName}`.trim()} role="presentation">
      <section
        ref={dialogRef}
        className={`visit-dialog ${className}`.trim()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <h2 id={titleId}>{title}</h2>
        {description ? <p id={descriptionId}>{description}</p> : null}
        <div className="visit-dialog-actions">
          {cancelLabel && onCancel ? (
            <button ref={cancelButtonRef} type="button" className="cancel" onClick={onCancel} disabled={busy}>
              {cancelLabel}
            </button>
          ) : null}
          <button ref={confirmButtonRef} type="button" className="confirm" onClick={onConfirm} disabled={busy} aria-busy={busy}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
