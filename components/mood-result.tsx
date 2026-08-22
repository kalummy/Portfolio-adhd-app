"use client";

import Image from "next/image";
import { BottomActions, FlowHeader, PrimaryButton } from "@/components/flow-ui";
import { MobileShell } from "@/components/mobile-shell";
import { VisitDialog } from "@/components/visit-dialog";
import { getMoodDiarySummary, type MoodResultData } from "@/lib/mood-summary";

type MoodResultProps = {
  result: MoodResultData;
  targetDateLabel: string;
  dialog: "restart" | "exit" | null;
  saving: boolean;
  onBack: () => void;
  onCancelDialog: () => void;
  onConfirmExit: () => void;
  onConfirmRestart: () => void;
  onRestart: () => void;
  onSave: () => void;
};

function formatRecordedAt(recordedAt: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(recordedAt));
}

export function MoodResult({
  result,
  targetDateLabel,
  dialog,
  saving,
  onBack,
  onCancelDialog,
  onConfirmExit,
  onConfirmRestart,
  onRestart,
  onSave,
}: MoodResultProps) {
  return (
    <MobileShell className="flow-screen mood-result-screen">
      <FlowHeader title="감정 기록하기" beforeBack={onBack} onBackOnly />

      <section className="mood-result-content">
        <span className="mood-target-date mood-result-target-date">{targetDateLabel} 기록</span>
        <div className="mood-result-item">
          <Image src={result.imagePath} alt="" width={120} height={120} priority />
          <div className="mood-result-info">
            <h1>{result.label}</h1>
            <p>{formatRecordedAt(result.recordedAt)} 기록</p>
          </div>
        </div>

        <section className="mood-result-summary">
          <div className="mood-result-summary-title">
            <Image src="/icons/mood-diary.svg" alt="" width={20} height={20} />
            <h2>{targetDateLabel}의 일기</h2>
          </div>
          <p>{getMoodDiarySummary(result.summaryItems)}</p>
        </section>
      </section>

      <BottomActions>
        <div className="split-actions mood-result-actions">
          <PrimaryButton type="button" variant="soft" onClick={onRestart} disabled={saving}>
            다시 하기
          </PrimaryButton>
          <PrimaryButton type="button" onClick={onSave} disabled={saving}>
            저장
          </PrimaryButton>
        </div>
      </BottomActions>

      {dialog === "restart" ? (
        <VisitDialog
          title={(
            <>
              <span>처음부터 다시 기록할까요?</span>
              <span>방금 기록한 내용은 지워져요</span>
            </>
          )}
          cancelLabel="취소"
          confirmLabel="다시 하기"
          onCancel={onCancelDialog}
          onConfirm={onConfirmRestart}
        />
      ) : null}

      {dialog === "exit" ? (
        <VisitDialog
          title="감정 기록을 중단할까요?"
          cancelLabel="취소"
          confirmLabel="중단하기"
          onCancel={onCancelDialog}
          onConfirm={onConfirmExit}
        />
      ) : null}
    </MobileShell>
  );
}
