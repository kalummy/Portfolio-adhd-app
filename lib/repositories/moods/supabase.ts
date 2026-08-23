import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  fromSupabaseMood,
  toSupabaseMood,
  type SupabaseMoodRow,
} from "./mapper";
import type { MoodRepository } from "./types";

const LEGACY_MOOD_COLUMNS = "user_id,mood_date,mood,recorded_at,summary";
const MOOD_COLUMNS = `${LEGACY_MOOD_COLUMNS},details,clinic_phrase`;

function isMissingExtendedMoodColumns(error: { message?: string } | null) {
  return Boolean(error?.message && /details|clinic_phrase/u.test(error.message));
}

export function createSupabaseMoodRepository(userId: string): MoodRepository {
  const supabase = createBrowserSupabaseClient();

  return {
    async listAll() {
      const { data, error } = await supabase
        .from("mood_records")
        .select(MOOD_COLUMNS)
        .eq("user_id", userId)
        .order("mood_date", { ascending: true })
        .order("recorded_at", { ascending: true });
      if (error && isMissingExtendedMoodColumns(error)) {
        const fallback = await supabase
          .from("mood_records")
          .select(LEGACY_MOOD_COLUMNS)
          .eq("user_id", userId)
          .order("mood_date", { ascending: true });
        if (fallback.error) throw fallback.error;
        return (fallback.data as unknown as SupabaseMoodRow[]).map(fromSupabaseMood);
      }
      if (error) throw error;
      return (data as unknown as SupabaseMoodRow[]).map(fromSupabaseMood);
    },
    async save(record) {
      const { data, error } = await supabase
        .from("mood_records")
        .upsert(toSupabaseMood(record, userId), {
          onConflict: "user_id,mood_date",
        })
        .select(MOOD_COLUMNS)
        .single();
      if (error && isMissingExtendedMoodColumns(error)) {
        const legacyRow = toSupabaseMood(record, userId);
        const fallback = await supabase
          .from("mood_records")
          .upsert({
            user_id: legacyRow.user_id,
            mood_date: legacyRow.mood_date,
            mood: legacyRow.mood,
            recorded_at: legacyRow.recorded_at,
            summary: legacyRow.summary,
          }, { onConflict: "user_id,mood_date" })
          .select(LEGACY_MOOD_COLUMNS)
          .single();
        if (fallback.error) throw fallback.error;
        return fromSupabaseMood(fallback.data as unknown as SupabaseMoodRow);
      }
      if (error) throw error;
      return fromSupabaseMood(data as unknown as SupabaseMoodRow);
    },
  };
}
