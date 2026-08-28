import { DuplicateMoodRecordError } from "../repositories/moods/types";
import type { MoodSaveFailureType, MoodStorageBackend } from "./mood-contract";

export function classifyMoodSaveFailure(error: unknown, backend: MoodStorageBackend): MoodSaveFailureType {
  // Supabase constructs this exception only for SQLSTATE 23505. IndexedDB also
  // uses it for an abort without an error, so the class alone is not evidence
  // of a duplicate there. Do not alter the repository's legacy exception/UX.
  if (error instanceof DuplicateMoodRecordError) {
    return backend === "supabase" ? "duplicate" : backend === "indexeddb" ? "storage_error" : "unknown";
  }
  if (!error || typeof error !== "object") return "unknown";
  const value = error as { name?: unknown; code?: unknown; __isAuthError?: unknown };
  if (value.__isAuthError === true || value.code === "PGRST301" || value.code === "PGRST303") return "auth_error";
  if (backend === "indexeddb") {
    if (value.name === "ConstraintError") return "duplicate";
    if (value.name === "DataError" || value.name === "DataCloneError") return "validation_error";
    return "storage_error";
  }
  // Do not guess network failures from raw messages (PostgREST can obscure them).
  if (backend === "supabase" && typeof value.code === "string" && value.code) return "storage_error";
  return "unknown";
}
