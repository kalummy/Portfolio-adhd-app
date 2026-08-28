"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomActions, FlowHeader, PrimaryButton } from "@/components/flow-ui";
import { MedicationSummaryCard } from "@/components/medication-card";
import { MobileShell } from "@/components/mobile-shell";
import { trackMedicationAdded, trackMedicationSaveClicked, trackMedicationRegistrationFailed } from "@/lib/analytics/events";
import { useMedicationRegistrationStep } from "@/lib/analytics/use-medication-registration-step";
import type { MedicationStorageBackend } from "@/lib/analytics/medication-contract";
import { createClientId } from "@/lib/client-id";
import {
  createSavedMedicationsFromDraft,
  getMedicationRepository,
} from "@/lib/repositories/medications";
import {
  clearDraft,
  dateContextHref,
  getDraft,
  registrationHref,
  setLastSavedMedicationIds,
  updateDraft,
  updateDraftMedication,
} from "@/lib/registration-session";
import type { MedicationDraft, MedicationSchedule } from "@/lib/types";

const schedules: Array<{ value: MedicationSchedule; label: string }> = [
  { value: "daily", label: "매일" },
  { value: "as-needed", label: "필요시" },
  { value: "bedtime", label: "자기 전" },
];

export default function MedicationSchedulePage() {
  const router = useRouter();
  const [draft, setDraft] = useState<MedicationDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);

  useEffect(() => {
    const current = getDraft();
    const activeDraftId = current.activeScheduleDraftId ?? current.scheduleQueueDraftIds[0];
    if (!activeDraftId || !current.draftMedications.some((item) => item.draftId === activeDraftId)) {
      router.replace(registrationHref(
        current.draftMedications.length > 0 ? "/medications/new/review" : "/medications/new/search",
      ));
      return;
    }
    if (current.activeScheduleDraftId !== activeDraftId) {
      current.activeScheduleDraftId = activeDraftId;
      updateDraft({ activeScheduleDraftId: activeDraftId });
    }
    setDraft(current);
  }, [router]);

  const activeMedication = useMemo(() => {
    if (!draft?.activeScheduleDraftId) return undefined;
    return draft.draftMedications.find(
      (medication) => medication.draftId === draft.activeScheduleDraftId,
    );
  }, [draft]);

  // Photo-only registration keeps its existing completion event, without new steps.
  const instrumentRegistration = Boolean(draft?.draftMedications.some((medication) => medication.source !== "photo"));
  const analyticsAttempt = useMedicationRegistrationStep("schedule", Boolean(draft && activeMedication), instrumentRegistration);

  if (!draft || !activeMedication) return <MobileShell className="flow-screen">{null}</MobileShell>;

  const queueIndex = draft.scheduleQueueDraftIds.indexOf(activeMedication.draftId);

  function selectSchedule(schedule: MedicationSchedule) {
    const next = updateDraftMedication(activeMedication!.draftId, { schedule });
    setDraft(next);
  }

  function goToPreviousSchedule() {
    if (queueIndex > 0) {
      const previousDraftId = draft!.scheduleQueueDraftIds[queueIndex - 1];
      const next = updateDraft({ activeScheduleDraftId: previousDraftId });
      setDraft(next);
      return;
    }

    router.replace(registrationHref(
      activeMedication!.source === "photo"
        ? "/medications/new/photo/result"
        : "/medications/new/review",
    ));
  }

  async function continueSchedule() {
    if (!activeMedication!.schedule || savingRef.current) return;
    const nextDraftId = draft!.scheduleQueueDraftIds[queueIndex + 1];
    if (nextDraftId) {
      const next = updateDraft({ activeScheduleDraftId: nextDraftId });
      setDraft(next);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError("");
    const attempt = analyticsAttempt.current;
    if (instrumentRegistration) trackMedicationSaveClicked(attempt, draft!.draftMedications.length);
    let repositorySaved = false;
    let storageBackend: MedicationStorageBackend = "unknown";
    try {
      const completedDraft = updateDraft({
        activeScheduleDraftId: undefined,
        scheduleQueueDraftIds: [],
      });
      const medications = createSavedMedicationsFromDraft(completedDraft);
      const repository = await getMedicationRepository();
      storageBackend = repository.storageBackend ?? "unknown";
      const saved = await repository.createMany(medications);
      repositorySaved = true;
      trackMedicationAdded(attempt);
      setLastSavedMedicationIds(saved.map((medication) => medication.id));
      clearDraft();
      const toastId = createClientId();
      router.replace(dateContextHref(
        `/?medicationToast=added&toastId=${encodeURIComponent(toastId)}`,
      ));
    } catch (saveError) {
      if (!repositorySaved && instrumentRegistration) trackMedicationRegistrationFailed(attempt, saveError, storageBackend);
      savingRef.current = false;
      setSaving(false);
      setError("저장하지 못했어요. 잠시 후 다시 시도해주세요.");
    }
  }

  return (
    <MobileShell className="flow-screen schedule-screen">
      <FlowHeader beforeBack={goToPreviousSchedule} onBackOnly />
      <section className="flow-content schedule-content">
        <MedicationSummaryCard medication={activeMedication} />
        <h1>복용 일정을 선택해주세요</h1>
        <div className="schedule-options" role="radiogroup" aria-label="복용 일정">
          {schedules.map((schedule) => (
            <button
              type="button"
              role="radio"
              aria-checked={activeMedication.schedule === schedule.value}
              className={`schedule-option ${activeMedication.schedule === schedule.value ? "selected" : ""}`}
              key={schedule.value}
              onClick={() => selectSchedule(schedule.value)}
            >
              <span className="radio-mark" aria-hidden="true">
                {activeMedication.schedule === schedule.value ? (
                  <Image src="/icons/radio-selected.svg" alt="" width={20} height={20} />
                ) : (
                  <>
                    <Image className="radio-default-outer" src="/icons/radio-default-outer.svg" alt="" width={20} height={20} />
                    <Image className="radio-default-inner" src="/icons/radio-default-inner.svg" alt="" width={8} height={8} />
                  </>
                )}
              </span>
              <strong>{schedule.label}</strong>
            </button>
          ))}
        </div>
      </section>
      <BottomActions>
        {error ? <p className="save-error" role="alert">{error}</p> : null}
        <PrimaryButton
          type="button"
          disabled={!activeMedication.schedule || saving}
          aria-busy={saving}
          onClick={() => void continueSchedule()}
        >
          {saving ? "저장 중..." : "다음"}
        </PrimaryButton>
      </BottomActions>
    </MobileShell>
  );
}
