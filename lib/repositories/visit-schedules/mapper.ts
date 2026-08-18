import type { VisitSchedule } from "@/lib/types";

export type SupabaseVisitScheduleRow = {
  user_id: string;
  visit_id: "upcoming";
  visit_date: string;
  created_at: string;
  updated_at: string;
};

export type SupabaseVisitScheduleMigrationInput = Omit<
  SupabaseVisitScheduleRow,
  "user_id"
>;

export function fromSupabaseVisitSchedule(
  row: SupabaseVisitScheduleRow,
): VisitSchedule {
  return {
    id: row.visit_id,
    visitDate: row.visit_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toSupabaseVisitSchedule(
  visit: VisitSchedule,
  userId: string,
): SupabaseVisitScheduleRow {
  return {
    ...toSupabaseVisitScheduleMigrationInput(visit),
    user_id: userId,
  };
}

export function toSupabaseVisitScheduleMigrationInput(
  visit: VisitSchedule,
): SupabaseVisitScheduleMigrationInput {
  return {
    visit_id: visit.id,
    visit_date: visit.visitDate,
    created_at: visit.createdAt,
    updated_at: visit.updatedAt,
  };
}
