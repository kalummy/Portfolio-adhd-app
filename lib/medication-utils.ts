import type { MedicationCandidate, MedicationSchedule } from "./types";

export const MEDICATION_FALLBACK_IMAGE = "/icons/medication-fallback-64.svg";

export function medicationLabel(medication: MedicationCandidate) {
  if (medication.displayLabel) return medication.displayLabel;
  return `${medication.name} ${medication.strengthValue}${medication.strengthUnit}`;
}

const MEDICATION_SCHEDULE_LABELS: Record<MedicationSchedule, string> = {
  daily: "매일 복용",
  "as-needed": "필요시 복용",
  bedtime: "자기 전 복용",
};

export function medicationScheduleLabel(schedule: MedicationSchedule) {
  return MEDICATION_SCHEDULE_LABELS[schedule];
}
