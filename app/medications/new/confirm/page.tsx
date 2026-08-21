"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomActions, FlowHeader, PrimaryButton } from "@/components/flow-ui";
import { MedicationSummaryCard } from "@/components/medication-card";
import { MobileShell } from "@/components/mobile-shell";
import { enrichOfficialMedications } from "@/lib/medication-enrichment";
import {
  commitProvisionalMedications,
  confirmPendingCandidates,
  discardScheduleQueueCandidates,
  getDraft,
  registrationHref,
  updateDraft,
} from "@/lib/registration-session";
import type { DraftMedication, MedicationDraft } from "@/lib/types";

export default function MedicationConfirmPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<MedicationDraft | null>(null);
  const [enriching, setEnriching] = useState(false);

  useEffect(() => {
    const initialDraft = getDraft();
    setDraft(initialDraft);
    if (initialDraft.pendingCandidates.length === 0) return;

    let active = true;
    setEnriching(true);
    void enrichOfficialMedications(initialDraft.pendingCandidates)
      .then((pendingCandidates) => {
        if (!active) return;
        const nextDraft = updateDraft({ pendingCandidates });
        setDraft(nextDraft);
      })
      .finally(() => {
        if (active) setEnriching(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (!draft) return <MobileShell className="flow-screen">{null}</MobileShell>;

  const queueCandidates = draft.scheduleQueueDraftIds
    .map((draftId) => draft.draftMedications.find((medication) => medication.draftId === draftId))
    .filter((medication): medication is DraftMedication => (
      Boolean(medication) && medication?.source !== "photo"
    ));
  const candidates = draft.pendingCandidates.length > 0
    ? draft.pendingCandidates
    : queueCandidates;
  const source = candidates[0]?.source ?? "search";

  function rejectCandidates() {
    if (draft!.pendingCandidates.length > 0) {
      updateDraft({ pendingCandidates: [] });
    } else {
      discardScheduleQueueCandidates();
    }
    router.push(registrationHref(
      source === "manual" ? "/medications/new/manual/name" : "/medications/new/search",
    ));
  }

  function confirmCandidates() {
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

  return (
    <MobileShell className="flow-screen">
      <FlowHeader
        fallbackHref={registrationHref(
          source === "manual" ? "/medications/new/manual/name" : "/medications/new/search",
        )}
      />
      <section className="flow-content confirm-content">
        <h1>복용중인 약이 맞는지<br />이름과 용량을 확인해주세요</h1>
        <div className="confirm-card-list">
          {candidates.map((medication) => (
            <MedicationSummaryCard key={medication.draftId} medication={medication} />
          ))}
        </div>
      </section>
      <BottomActions>
        <div className="split-actions">
          <PrimaryButton
            type="button"
            variant="soft"
            onClick={rejectCandidates}
          >
            아니에요
          </PrimaryButton>
          <PrimaryButton
            type="button"
            disabled={enriching}
            aria-busy={enriching}
            onClick={confirmCandidates}
          >
            {enriching ? "정보 확인 중..." : "맞아요"}
          </PrimaryButton>
        </div>
      </BottomActions>
    </MobileShell>
  );
}
