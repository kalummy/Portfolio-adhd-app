import { createClientId } from "@/lib/client-id";
import type { MedicationDraft, SavedMedication } from "@/lib/types";

export function createSavedMedicationsFromDraft(draft: MedicationDraft): SavedMedication[] {
  if (
    !draft.noticeAccepted
    || draft.draftMedications.length === 0
    || draft.draftMedications.some((medication) => !medication.source || !medication.schedule)
  ) {
    throw new Error("저장할 복용약 정보가 완성되지 않았어요.");
  }

  const createdAt = new Date().toISOString();
  return draft.draftMedications.map(
    ({ draftId: _draftId, source, schedule, ...medication }): SavedMedication => ({
      ...medication,
      id: createClientId(),
      registrationMethod: source,
      schedule: schedule!,
      createdAt,
      active: true,
    }),
  );
}
