"use client";

import { useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomActions, FlowHeader, PrimaryButton } from "@/components/flow-ui";
import { MedicationSummaryCard } from "@/components/medication-card";
import { MobileShell } from "@/components/mobile-shell";
import {
  clearPendingCandidates,
  commitProvisionalMedications,
  confirmPendingCandidates,
  discardScheduleQueueCandidates,
  getDraft,
  registrationHref,
  updateDraft,
} from "@/lib/registration-session";
import type { DraftMedication, MedicationDraft } from "@/lib/types";

const PHOTO_RETRY_KEY = "addi-photo-capture-retry";

export default function MedicationPhotoResultPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<MedicationDraft | null>(null);

  useLayoutEffect(() => {
    const currentDraft = getDraft();
    const queueCandidates = currentDraft.scheduleQueueDraftIds
      .map((draftId) => currentDraft.draftMedications.find((medication) => medication.draftId === draftId))
      .filter((medication): medication is DraftMedication => medication?.source === "photo");
    if (currentDraft.pendingCandidates.length === 0 && queueCandidates.length === 0) {
      router.replace(registrationHref("/medications/new/photo"));
      return;
    }
    setDraft(currentDraft);
  }, [router]);

  if (!draft) return null;

  function retryPhoto() {
    if (draft!.pendingCandidates.length > 0) {
      clearPendingCandidates();
    } else {
      discardScheduleQueueCandidates();
    }
    window.sessionStorage.setItem(PHOTO_RETRY_KEY, "1");
    router.push(registrationHref("/medications/new/photo"));
  }

  function confirmRecognizedMedications() {
    if (draft!.pendingCandidates.length > 0) {
      const { added } = confirmPendingCandidates();
      commitProvisionalMedications();
      router.push(registrationHref(
        added.length > 0 ? "/medications/new/schedule" : "/medications/new/review",
      ));
      return;
    }
    updateDraft({ activeScheduleDraftId: draft!.scheduleQueueDraftIds[0] });
    router.push(registrationHref("/medications/new/schedule"));
  }

  const queueCandidates = draft.scheduleQueueDraftIds
    .map((draftId) => draft.draftMedications.find((medication) => medication.draftId === draftId))
    .filter((medication): medication is DraftMedication => medication?.source === "photo");
  const candidates = draft.pendingCandidates.length > 0 ? draft.pendingCandidates : queueCandidates;

  return (
    <MobileShell className="flow-screen photo-result-screen">
      <FlowHeader
        fallbackHref={registrationHref("/medications/new/photo")}
        beforeBack={() => {
          if (draft.pendingCandidates.length > 0) {
            clearPendingCandidates();
          } else {
            discardScheduleQueueCandidates();
          }
          window.sessionStorage.setItem(PHOTO_RETRY_KEY, "1");
        }}
      />
      <section className="flow-content confirm-content photo-result-content">
        <h1>복용중인 약이 맞는지<br />이름과 용량을 확인해주세요</h1>
        <div className="confirm-card-list">
          {candidates.map((medication) => (
            <MedicationSummaryCard
              key={medication.draftId}
              medication={medication}
            />
          ))}
        </div>
      </section>
      <BottomActions>
        <div className="split-actions">
          <PrimaryButton type="button" variant="soft" onClick={retryPhoto}>아니에요</PrimaryButton>
          <PrimaryButton type="button" onClick={confirmRecognizedMedications}>맞아요</PrimaryButton>
        </div>
      </BottomActions>
    </MobileShell>
  );
}
