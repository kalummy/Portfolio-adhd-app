import type { MedicationIntakeRecord, MoodRecord, SavedMedication } from "./types";

export type WeekProgress = "complete" | "partial" | "empty";

export function getWeekProgress(
  dateKey: string,
  medications: SavedMedication[],
  intakeRecords: MedicationIntakeRecord[],
  moodRecords: MoodRecord[],
): WeekProgress {
  const registeredIds = new Set(medications.map((medication) => medication.id));
  const completedMedicationIds = new Set(
    intakeRecords
      .filter(
        (record) => record.date === dateKey && record.taken && registeredIds.has(record.medicationId),
      )
      .map((record) => record.medicationId),
  );
  const allMedicationsComplete =
    medications.length > 0 &&
    medications.every((medication) => completedMedicationIds.has(medication.id));
  const hasMoodRecord = moodRecords.some((record) => record.date === dateKey);

  if (allMedicationsComplete && hasMoodRecord) return "complete";
  if (completedMedicationIds.size > 0) return "partial";
  return "empty";
}
