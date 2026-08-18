import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  fromSupabaseVisitSchedule,
  toSupabaseVisitSchedule,
  type SupabaseVisitScheduleRow,
} from "./mapper";
import type { VisitScheduleRepository } from "./types";
import { assertValidVisitDate } from "./validation";

const VISIT_COLUMNS = "user_id,visit_id,visit_date,created_at,updated_at";

export function createSupabaseVisitScheduleRepository(
  userId: string,
): VisitScheduleRepository {
  const supabase = createBrowserSupabaseClient();

  async function getUpcoming() {
    const { data, error } = await supabase
      .from("visit_schedules")
      .select(VISIT_COLUMNS)
      .eq("user_id", userId)
      .eq("visit_id", "upcoming")
      .maybeSingle();
    if (error) throw error;
    return data
      ? fromSupabaseVisitSchedule(data as unknown as SupabaseVisitScheduleRow)
      : null;
  }

  return {
    getUpcoming,
    async saveUpcoming(visitDate) {
      assertValidVisitDate(visitDate);
      const current = await getUpcoming();
      const now = new Date().toISOString();
      if (current) {
        const { data, error } = await supabase
          .from("visit_schedules")
          .update({ visit_date: visitDate, updated_at: now })
          .eq("user_id", userId)
          .eq("visit_id", "upcoming")
          .select(VISIT_COLUMNS)
          .single();
        if (error) throw error;
        return fromSupabaseVisitSchedule(
          data as unknown as SupabaseVisitScheduleRow,
        );
      }

      const row = toSupabaseVisitSchedule({
        id: "upcoming",
        visitDate,
        createdAt: now,
        updatedAt: now,
      }, userId);
      const { data, error } = await supabase
        .from("visit_schedules")
        .insert(row)
        .select(VISIT_COLUMNS)
        .maybeSingle();
      if (error?.code === "23505") {
        const { data: concurrentData, error: concurrentError } = await supabase
          .from("visit_schedules")
          .update({ visit_date: visitDate, updated_at: now })
          .eq("user_id", userId)
          .eq("visit_id", "upcoming")
          .select(VISIT_COLUMNS)
          .single();
        if (concurrentError) throw concurrentError;
        return fromSupabaseVisitSchedule(
          concurrentData as unknown as SupabaseVisitScheduleRow,
        );
      }
      if (error || !data) throw error ?? new Error("내원일정을 저장하지 못했어요.");
      return fromSupabaseVisitSchedule(
        data as unknown as SupabaseVisitScheduleRow,
      );
    },
    async deleteUpcoming() {
      const { error } = await supabase
        .from("visit_schedules")
        .delete()
        .eq("user_id", userId)
        .eq("visit_id", "upcoming");
      if (error) throw error;
    },
  };
}
