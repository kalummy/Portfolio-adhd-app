"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomActions, FlowHeader, PrimaryButton } from "@/components/flow-ui";
import { MedicationSummaryCard } from "@/components/medication-card";
import { MobileShell } from "@/components/mobile-shell";
import { useMedicationRegistrationStep } from "@/lib/analytics/use-medication-registration-step";
import {
  commitProvisionalMedications,
  getDraft,
  prepareScheduleQueue,
  registrationHref,
  removeDraftMedication,
  rollbackProvisionalMedications,
  updateDraft,
} from "@/lib/registration-session";
import type { DraftMedication, MedicationDraft } from "@/lib/types";
import { medicationLabel } from "@/lib/medication-utils";

export default function MedicationReviewPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<MedicationDraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DraftMedication | null>(null);
  useMedicationRegistrationStep("review", Boolean(draft?.draftMedications.length),
    Boolean(draft?.draftMedications.some((medication) => medication.source !== "photo")));

  useEffect(() => {
    const current = getDraft();
    if (current.draftMedications.length === 0) {
      router.replace(registrationHref("/medications/new/search"));
      return;
    }
    setDraft(current);
  }, [router]);

  useLayoutEffect(() => {
    function handlePopState() {
      rollbackProvisionalMedications();
    }

    window.addEventListener("popstate", handlePopState, true);
    return () => window.removeEventListener("popstate", handlePopState, true);
  }, []);

  if (!draft) return <MobileShell className="flow-screen">{null}</MobileShell>;

  function addAnotherMedication() {
    commitProvisionalMedications();
    updateDraft({
      pendingCandidates: [],
      activeScheduleDraftId: undefined,
      scheduleQueueDraftIds: [],
      searchQuery: "",
      manualName: "",
      manualStrength: "",
    });
    router.push(registrationHref("/medications/new/search?return=review"));
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
      router.replace(registrationHref("/medications/new/search"));
      return;
    }
    setDraft(next);
  }

  function continueToSchedule() {
    commitProvisionalMedications();
    const next = prepareScheduleQueue();
    if (!next.activeScheduleDraftId) return;
    router.push(registrationHref("/medications/new/schedule"));
  }

  return (
    <MobileShell className="flow-screen review-screen">
      <FlowHeader beforeBack={rollbackProvisionalMedications} />
      <section className="flow-content review-content">
        <h1>복용중인 약이 맞는지<br />이름과 용량을 확인해주세요</h1>
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
          <PrimaryButton
            type="button"
            onClick={continueToSchedule}
          >
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
            aria-describedby="delete-medication-description"
          >
            <header>
              <h2 id="delete-medication-title">
                {medicationLabel(deleteTarget)}을 삭제할까요?
              </h2>
            </header>
            <p id="delete-medication-description">삭제하면 다시 약을 등록해야해요.</p>
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
