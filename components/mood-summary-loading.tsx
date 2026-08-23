import { MobileShell } from "@/components/mobile-shell";
import { FlowHeader } from "@/components/flow-ui";
import { MoodLoadingPrototype } from "@/components/mood-loading-prototype";
import { VisitDialog } from "@/components/visit-dialog";

type MoodSummaryLoadingProps = {
  showExitDialog: boolean;
  onAnimationComplete: () => void;
  onBack: () => void;
  onClose: () => void;
  onCancelExit: () => void;
  onConfirmExit: () => void;
};

export function MoodSummaryLoading({
  showExitDialog,
  onAnimationComplete,
  onBack,
  onClose,
  onCancelExit,
  onConfirmExit,
}: MoodSummaryLoadingProps) {
  return (
    <MobileShell className="mood-summary-screen" aria-live="polite" aria-busy="true">
      <FlowHeader title="감정 기록하기" onBack={onBack} onClose={onClose} />
      <div className="mood-summary-copy">
        <h1>
          <span>잠시만 기다려주세요</span>
          <span>감정 기록을 작성중이에요</span>
        </h1>
        <div className="mood-summary-animation-frame">
          <MoodLoadingPrototype onComplete={onAnimationComplete} />
        </div>
      </div>
      {showExitDialog ? <VisitDialog title="감정 기록을 중단할까요?" cancelLabel="취소" confirmLabel="중단하기"
        onCancel={onCancelExit} onConfirm={onConfirmExit} /> : null}
    </MobileShell>
  );
}
