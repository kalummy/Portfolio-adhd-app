"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomActions, FlowHeader, PrimaryButton } from "@/components/flow-ui";
import { MedicationSummaryCard } from "@/components/medication-card";
import { MobileShell } from "@/components/mobile-shell";
import {
  getDraft,
  removeDraftMedication,
  updateDraft,
} from "@/lib/registration-session";
import type { DraftMedication, MedicationDraft } from "@/lib/types";
import { medicationLabel } from "@/lib/medication-utils";

export default function MedicationReviewPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<MedicationDraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DraftMedication | null>(null);

  useEffect(() => {
    const current = getDraft();
    if (current.draftMedications.length === 0) {
      router.replace("/medications/new/search");
      return;
    }
    setDraft(current);
  }, [router]);

  if (!draft) return <MobileShell className="flow-screen">{null}</MobileShell>;

  function addAnotherMedication() {
    updateDraft({
      pendingCandidates: [],
      activeScheduleDraftId: undefined,
      scheduleQueueDraftIds: [],
      searchQuery: "",
      manualName: "",
      manualStrength: "",
    });
    router.push("/medications/new/search");
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const next = removeDraftMedication(deleteTarget.draftId);
    setDeleteTarget(null);
    if (next.draftMedications.length === 0) {
      updateDraft({
        pendingCandidates: [],
        activeScheduleDraftId: undefined,
        scheduleQueueDraftIds: [],
        searchQuery: "",
      });
      router.replace("/medications/new/search");
      return;
    }
    setDraft(next);
  }

  return (
    <MobileShell className="flow-screen review-screen">
      <FlowHeader />
      <section className="flow-content review-content">
        <h1>현재 추가한 약을 확인해주세요</h1>
        <p>잘못 추가한 약은 삭제 아이콘을 눌러주세요.</p>
        <div className="review-medication-section">
          <span>현재 추가한 약</span>
          <div className="review-medication-list">
            {draft.draftMedications.map((medication) => (
              <div className="review-medication-row" key={medication.draftId}>
                <MedicationSummaryCard medication={medication} />
                <button
                  type="button"
                  className="delete-medication-button"
                  aria-label={`${medicationLabel(medication)} 삭제`}
                  onClick={() => setDeleteTarget(medication)}
                >
                  <Image src="/icons/trash-outline.svg" alt="" width={18} height={18} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
      <BottomActions>
        <div className="split-actions">
          <PrimaryButton type="button" variant="soft" onClick={addAnotherMedication}>
            다른 약 추가
          </PrimaryButton>
          <PrimaryButton type="button" onClick={() => router.push("/medications/new/notice")}>
            다음으로
          </PrimaryButton>
        </div>
      </BottomActions>

      {deleteTarget ? (
        <div className="review-delete-layer" role="presentation">
          <section
            className="review-delete-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-medication-title"
          >
            <header>
              <h2 id="delete-medication-title">
                {medicationLabel(deleteTarget)}을 삭제할까요?
              </h2>
            </header>
            <p>삭제하면 다시 약을 등록해야해요.</p>
            <div className="review-delete-actions">
              <button type="button" className="cancel" onClick={() => setDeleteTarget(null)}>
                취소
              </button>
              <button type="button" className="delete" onClick={confirmDelete}>
                삭제
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </MobileShell>
  );
}
