import type { ReactNode } from "react";

type VisitDialogProps = {
  title: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
};

export function VisitDialog({
  title,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  busy = false,
}: VisitDialogProps) {
  return (
    <div className="visit-dialog-layer" role="presentation">
      <section
        className="visit-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="visit-dialog-title"
      >
        <h2 id="visit-dialog-title">{title}</h2>
        <div className="visit-dialog-actions">
          <button type="button" className="cancel" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className="confirm" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
