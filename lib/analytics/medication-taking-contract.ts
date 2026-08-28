import { classifyMedicationSaveFailure, type MedicationStorageBackend } from "./medication-contract";

export const MEDICATION_TAKING_FLOW_VERSION = "medication_taking_v2_instrumented" as const;
export const MEDICATION_TAKE_FAILURE_TYPES = [
  "storage_error", "network", "auth_error", "validation_error", "unknown",
] as const;
export type MedicationTakeFailureType = typeof MEDICATION_TAKE_FAILURE_TYPES[number];
export type MedicationTakeStorageBackend = MedicationStorageBackend;
export type MedicationTakingContext = {
  medication_take_attempt_id: string;
  flow_version: typeof MEDICATION_TAKING_FLOW_VERSION;
};

// Reuse only the conservative structured-error classifier, not registration IDs
// or lifecycle. A duplicate/constraint failure is a storage failure in this flow.
export function classifyMedicationTakeFailure(error: unknown, backend: MedicationTakeStorageBackend): MedicationTakeFailureType {
  const failure = classifyMedicationSaveFailure(error, backend);
  return failure === "duplicate" ? "storage_error" : failure;
}
