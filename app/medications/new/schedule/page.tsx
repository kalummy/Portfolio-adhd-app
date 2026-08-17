"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomActions, FlowHeader, PrimaryButton } from "@/components/flow-ui";
import { MedicationSummaryCard } from "@/components/medication-card";
import { MobileShell } from "@/components/mobile-shell";
import {
  getDraft,
  registrationHref,
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
        : "/medications/new/confirm",
    ));
  }

  function continueSchedule() {
    if (!activeMedication!.schedule) return;
    const nextDraftId = draft!.scheduleQueueDraftIds[queueIndex + 1];
    if (nextDraftId) {
      const next = updateDraft({ activeScheduleDraftId: nextDraftId });
      setDraft(next);
      return;
    }

    updateDraft({ activeScheduleDraftId: undefined, scheduleQueueDraftIds: [] });
    router.push(registrationHref("/medications/new/review"));
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
        <PrimaryButton
          type="button"
          disabled={!activeMedication.schedule}
          onClick={continueSchedule}
        >
          다음
        </PrimaryButton>
      </BottomActions>
    </MobileShell>
  );
}
