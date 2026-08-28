export const MOOD_FLOW_VERSION = "mood_v2_instrumented" as const;

export const MOOD_ANALYSIS_FAILURE_TYPES = [
  "network", "timeout", "configuration_error", "provider_error",
  "response_error", "validation_error", "api_error", "unknown",
] as const;
export type MoodAnalysisFailureType = typeof MOOD_ANALYSIS_FAILURE_TYPES[number];
export const MOOD_SAVE_FAILURE_TYPES = [
  "duplicate", "storage_error", "network", "auth_error", "validation_error", "unknown",
] as const;
export type MoodSaveFailureType = typeof MOOD_SAVE_FAILURE_TYPES[number];
export type MoodStorageBackend = "indexeddb" | "supabase" | "unknown";
export type MoodAnalyticsContext = {
  mood_attempt_id: string;
  flow_version: typeof MOOD_FLOW_VERSION;
};

export function isMoodAttemptId(value: unknown): value is string {
  return typeof value === "string"
    && /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{13}-[a-z0-9]{1,12})$/iu.test(value);
}

export function isMoodAnalysisFailure(value: unknown): value is MoodAnalysisFailureType {
  return MOOD_ANALYSIS_FAILURE_TYPES.includes(value as MoodAnalysisFailureType);
}

// Only diagnostic body parsing is bounded. This does not abort the AI request
// or change the provider timeout/validation rules.
export const MOOD_ERROR_BODY_WAIT_MS = 100;
export async function readMoodAnalysisFailure(response: Pick<Response, "json">): Promise<MoodAnalysisFailureType> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const parsed = Promise.resolve().then(() => response.json()).then((body: unknown) => {
      const failure = body && typeof body === "object"
        ? (body as { failure_type?: unknown }).failure_type : undefined;
      return isMoodAnalysisFailure(failure) ? failure : "api_error" as const;
    }).catch(() => "api_error" as const);
    return await Promise.race([
      parsed,
      new Promise<"api_error">((resolve) => { timer = setTimeout(() => resolve("api_error"), MOOD_ERROR_BODY_WAIT_MS); }),
    ]);
  } catch {
    return "api_error";
  } finally {
    clearTimeout(timer);
  }
}

// Only fixed categories leave the API. Provider codes/messages are never properties.
export function classifyMoodAnalysisDiagnostic(diagnostic: { stage: string; code: string }): MoodAnalysisFailureType {
  if (diagnostic.code === "provider_timeout") return "timeout";
  if (diagnostic.code === "provider_fetch_failed") return "network";
  if (diagnostic.code === "provider_not_configured") return "configuration_error";
  if (diagnostic.stage === "provider_http") return "provider_error";
  if (["response_body", "output_extract", "output_json"].includes(diagnostic.stage)) return "response_error";
  if (["schema_validation", "evidence_grounding", "medical_safety", "quality_validation"].includes(diagnostic.stage)) return "validation_error";
  return "unknown";
}
