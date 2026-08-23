import { getKstDateKey, isValidDateKey, KST_TIME_ZONE } from "@/lib/kst-date";
import {
  resolveMedicationEditorInitialTime as resolveMedicationEditorInitialTimeWithContext,
} from "@/lib/medication-time";
import type { MedicationIntakeRecord, SavedMedication } from "@/lib/types";

export function resolveMedicationEditorInitialTime(
  medication: Pick<SavedMedication, "id" | "scheduledTime">,
  records: MedicationIntakeRecord[],
  todayDateKey = getKstDateKey(),
) {
  return resolveMedicationEditorInitialTimeWithContext(
    medication,
    records,
    {
      todayDateKey,
      timeZone: KST_TIME_ZONE,
      isValidDateKey,
    },
  );
}
