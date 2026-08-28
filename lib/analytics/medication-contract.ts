export const MEDICATION_REGISTRATION_FLOW_VERSION = "medication_registration_v2_instrumented" as const;
export const MEDICATION_REGISTRATION_STEPS = ["search", "review", "schedule"] as const;
export type MedicationRegistrationStep = typeof MEDICATION_REGISTRATION_STEPS[number];
export const MEDICATION_SAVE_FAILURE_TYPES = [
  "duplicate", "storage_error", "network", "auth_error", "validation_error", "unknown",
] as const;
export type MedicationSaveFailureType = typeof MEDICATION_SAVE_FAILURE_TYPES[number];
export type MedicationStorageBackend = "indexeddb" | "supabase" | "unknown";
export type MedicationAnalyticsContext = {
  medication_attempt_id: string;
  flow_version: typeof MEDICATION_REGISTRATION_FLOW_VERSION;
};

export function isMedicationAttemptId(value: unknown): value is string {
  return typeof value === "string"
    && /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{13}-[a-z0-9]{1,12})$/iu.test(value);
}

// Diagnostic classification only: never change repository errors or save policy.
// Do not infer a network/duplicate failure from a TypeError or message text.
export function classifyMedicationSaveFailure(error: unknown, backend: MedicationStorageBackend): MedicationSaveFailureType {
  try {
    if (!error || typeof error !== "object") return "unknown";
    const { name, code, status } = error as { name?: unknown; code?: unknown; status?: unknown };
    if (backend === "indexeddb") {
      if (name === "ConstraintError") return "duplicate";
      return "storage_error";
    }
    if (code === "23505") return "duplicate";
    if (status === 401 || status === 403 || code === "42501" || code === "PGRST301") return "auth_error";
    if (code === "23502" || code === "23503" || code === "23514" || code === "22P02") return "validation_error";
    if (name === "NetworkError") return "network";
    return backend === "supabase" ? "storage_error" : "unknown";
  } catch {
    return "unknown";
  }
}
