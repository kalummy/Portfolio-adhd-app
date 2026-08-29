import { getMoodPresentation, type MoodType } from "@/lib/mood-summary";
import type { MoodRecord } from "@/lib/types";
import { resolveMoodMigrationSummary } from "./migration-summary";
import type { NewMoodRecord } from "./types";

export type SupabaseMoodRow = {
  user_id: string;
  mood_date: string;
  mood: MoodType;
  recorded_at: string;
  summary: string;
  details?: MoodRecord["details"] | null;
  clinic_phrase?: string | null;
  cat_id?: MoodRecord["catId"];
  analysis_status?: MoodRecord["analysisStatus"];
  analysis_result?: MoodRecord["analysisResult"];
  analysis_version?: string | null;
  analysis_model?: string | null;
  analysis_created_at?: string | null;
};

export type SupabaseMoodMigrationInput = Omit<SupabaseMoodRow, "user_id">;

export function fromSupabaseMood(row: SupabaseMoodRow): MoodRecord {
  const presentation = getMoodPresentation(row.mood);
  return {
    id: row.mood_date,
    date: row.mood_date,
    mood: row.mood,
    moodLabel: presentation.label,
    recordedAt: row.recorded_at,
    diaryEntries: [row.summary],
    memberSummary: row.summary,
    clinicPhrase: row.clinic_phrase ?? row.summary,
    details: row.details ?? undefined,
    catId: row.cat_id ?? null,
    analysisStatus: row.analysis_status ?? null,
    analysisResult: row.analysis_result ?? null,
    analysisVersion: row.analysis_version ?? null,
    analysisModel: row.analysis_model ?? null,
    analysisCreatedAt: row.analysis_created_at ?? null,
  };
}

export function toSupabaseMood(
  record: NewMoodRecord,
  userId: string,
): SupabaseMoodRow {
  return {
    ...toSupabaseMoodMigrationInput(record),
    user_id: userId,
  };
}

export function toSupabaseMoodMigrationInput(
  record: Pick<MoodRecord, "date" | "mood" | "recordedAt" | "diaryEntries" | "memberSummary" | "details" | "clinicPhrase" | "catId" | "analysisStatus" | "analysisResult" | "analysisVersion" | "analysisModel" | "analysisCreatedAt">,
): SupabaseMoodMigrationInput {
  const summary = resolveMoodMigrationSummary(record);
  return {
    mood_date: record.date,
    mood: record.mood as MoodType,
    recorded_at: record.recordedAt,
    summary,
    details: record.details ?? null,
    clinic_phrase: record.clinicPhrase ?? summary,
    cat_id: record.catId ?? null,
    analysis_status: record.analysisStatus ?? null,
    analysis_result: record.analysisResult ?? null,
    analysis_version: record.analysisVersion ?? null,
    analysis_model: record.analysisModel ?? null,
    analysis_created_at: record.analysisCreatedAt ?? null,
  };
}
