import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  fromSupabaseMood,
  toSupabaseMood,
  type SupabaseMoodRow,
} from "./mapper";
import type { MoodRepository } from "./types";

const MOOD_COLUMNS = "user_id,mood_date,mood,recorded_at,summary";

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
      if (error) throw error;
      return fromSupabaseMood(data as unknown as SupabaseMoodRow);
    },
  };
}
