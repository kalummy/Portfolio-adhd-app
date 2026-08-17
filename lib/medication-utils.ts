import type { MedicationCandidate } from "./types";

export const MEDICATION_FALLBACK_IMAGE = "/icons/medication-fallback-64.svg";

export function medicationLabel(medication: MedicationCandidate) {
  if (medication.displayLabel) return medication.displayLabel;
  return `${medication.name} ${medication.strengthValue}${medication.strengthUnit}`;
}
