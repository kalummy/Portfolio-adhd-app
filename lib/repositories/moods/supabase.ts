import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { fromSupabaseMood, toSupabaseMood, type SupabaseMoodRow } from "./mapper";
import { DuplicateMoodRecordError, type MoodRepository } from "./types";

const LEGACY_COLUMNS = "user_id,mood_date,mood,recorded_at,summary";
const COLUMNS = `${LEGACY_COLUMNS},details,clinic_phrase,cat_id,analysis_status,analysis_result,analysis_version,analysis_model,analysis_created_at`;
function isMissingColumns(error: { message?: string } | null) { return Boolean(error?.message && /details|clinic_phrase|cat_id|analysis_/u.test(error.message)); }

export function createSupabaseMoodRepository(userId: string): MoodRepository {
  const supabase = createBrowserSupabaseClient();
  async function listAll() {
    const query = await supabase.from("mood_records").select(COLUMNS).eq("user_id", userId).order("mood_date", { ascending: true }).order("recorded_at", { ascending: true });
    if (query.error && isMissingColumns(query.error)) {
      const fallback = await supabase.from("mood_records").select(LEGACY_COLUMNS).eq("user_id", userId).order("mood_date", { ascending: true });
      if (fallback.error) throw fallback.error;
      return (fallback.data as unknown as SupabaseMoodRow[]).map(fromSupabaseMood);
    }
    if (query.error) throw query.error;
    return (query.data as unknown as SupabaseMoodRow[]).map(fromSupabaseMood);
  }

  async function listRecent(startDate: string, endDate: string) {
    const query = await supabase
      .from("mood_records")
      .select(COLUMNS)
      .eq("user_id", userId)
      .gte("mood_date", startDate)
      .lte("mood_date", endDate)
      .order("mood_date", { ascending: false })
      .order("recorded_at", { ascending: false });
    if (query.error && isMissingColumns(query.error)) {
      const fallback = await supabase
        .from("mood_records")
        .select(LEGACY_COLUMNS)
        .eq("user_id", userId)
        .gte("mood_date", startDate)
        .lte("mood_date", endDate)
        .order("mood_date", { ascending: false })
        .order("recorded_at", { ascending: false });
      if (fallback.error) throw fallback.error;
      return (fallback.data as unknown as SupabaseMoodRow[]).map(fromSupabaseMood);
    }
    if (query.error) throw query.error;
    return (query.data as unknown as SupabaseMoodRow[]).map(fromSupabaseMood);
  }

  async function findByDate(date: string) {
    const query = await supabase
      .from("mood_records")
      .select(COLUMNS)
      .eq("user_id", userId)
      .eq("mood_date", date)
      .maybeSingle();
    if (query.error && isMissingColumns(query.error)) {
      const fallback = await supabase
        .from("mood_records")
        .select(LEGACY_COLUMNS)
        .eq("user_id", userId)
        .eq("mood_date", date)
        .maybeSingle();
      if (fallback.error) throw fallback.error;
      return fallback.data
        ? fromSupabaseMood(fallback.data as unknown as SupabaseMoodRow)
        : null;
    }
    if (query.error) throw query.error;
    return query.data ? fromSupabaseMood(query.data as unknown as SupabaseMoodRow) : null;
  }

  return {
    listAll,
    listRecent,
    findByDate,
    async save(record) {
      const { data, error } = await supabase.from("mood_records").insert(toSupabaseMood(record, userId)).select(COLUMNS).single();
      if (error?.code === "23505") throw new DuplicateMoodRecordError();
      if (error) throw error;
      return fromSupabaseMood(data as unknown as SupabaseMoodRow);
    },
    async deleteByDate(date) {
      const { error } = await supabase
        .from("mood_records")
        .delete()
        .eq("user_id", userId)
        .eq("mood_date", date);
      if (error) throw error;
    },
  };
}
