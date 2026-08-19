import { getMoodPresentation, type MoodType } from "@/lib/mood-summary";
import type { MoodRecord } from "@/lib/types";
import type { NewMoodRecord } from "./types";

export type SupabaseMoodRow = {
  user_id: string;
  mood_date: string;
  mood: MoodType;
  recorded_at: string;
  summary: string;
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
  record: Pick<MoodRecord, "date" | "mood" | "recordedAt" | "memberSummary">,
): SupabaseMoodMigrationInput {
  if (!record.memberSummary) {
    throw new Error("회원용 감정 요약이 없는 기록은 이전할 수 없어요.");
  }
  return {
    mood_date: record.date,
    mood: record.mood as MoodType,
    recorded_at: record.recordedAt,
    summary: record.memberSummary,
  };
}
