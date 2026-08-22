import type { MedicationIntakeRecord, MoodRecord } from "./types";

export type WeekProgress = "complete" | "partial" | "empty";

export function getWeekProgress(
  dateKey: string,
  intakeRecords: MedicationIntakeRecord[],
  moodRecords: MoodRecord[],
): WeekProgress {
  const hasMedicationIntake = intakeRecords.some(
    (record) => record.date === dateKey && record.taken,
  );
  const hasMoodRecord = moodRecords.some((record) => record.date === dateKey);

  if (hasMedicationIntake && hasMoodRecord) return "complete";
  if (hasMedicationIntake || hasMoodRecord) return "partial";
  return "empty";
}
