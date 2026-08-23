import { isValidDateKey, KST_TIME_ZONE } from "@/lib/kst-date";
import {
  resolveMedicationEditorInitialTime as resolveMedicationEditorInitialTimeWithContext,
} from "@/lib/medication-time";
import type { MedicationIntakeRecord } from "@/lib/types";

export function resolveMedicationEditorInitialTime(
  medicationId: string,
  records: MedicationIntakeRecord[],
  targetDateKey: string,
) {
  return resolveMedicationEditorInitialTimeWithContext(
    medicationId,
    records,
    {
      targetDateKey,
      timeZone: KST_TIME_ZONE,
      isValidDateKey,
    },
  );
}
