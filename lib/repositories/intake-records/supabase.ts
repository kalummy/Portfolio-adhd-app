import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  fromSupabaseMedicationIntake,
  toSupabaseMedicationIntake,
  toSupabaseMedicationIntakeMigrationInput,
  type SupabaseMedicationIntakeRow,
} from "./mapper";
import type { MedicationIntakeRepository } from "./types";

const INTAKE_COLUMNS = "user_id,medication_id,intake_date,recorded_at";

export function createSupabaseMedicationIntakeRepository(
  userId: string,
): MedicationIntakeRepository {
  const supabase = createBrowserSupabaseClient();

  async function findByMedicationAndDate(medicationId: string, date: string) {
    const { data, error } = await supabase
      .from("medication_intake_records")
      .select(INTAKE_COLUMNS)
      .eq("user_id", userId)
      .eq("medication_id", medicationId)
      .eq("intake_date", date)
      .maybeSingle();
    if (error) throw error;
    return data
      ? fromSupabaseMedicationIntake(data as unknown as SupabaseMedicationIntakeRow)
      : null;
  }

  return {
    async listAll() {
      const { data, error } = await supabase
        .from("medication_intake_records")
        .select(INTAKE_COLUMNS)
        .eq("user_id", userId)
        .order("intake_date", { ascending: true })
        .order("recorded_at", { ascending: true });
      if (error) throw error;
      return (data as unknown as SupabaseMedicationIntakeRow[]).map(
        fromSupabaseMedicationIntake,
      );
    },
    async listByDate(date) {
      const { data, error } = await supabase
        .from("medication_intake_records")
        .select(INTAKE_COLUMNS)
        .eq("user_id", userId)
        .eq("intake_date", date)
        .order("recorded_at", { ascending: true });
      if (error) throw error;
      return (data as unknown as SupabaseMedicationIntakeRow[]).map(
        fromSupabaseMedicationIntake,
      );
    },
    async hasHistory(medicationId) {
      const { data, error } = await supabase
        .from("medication_intake_records")
        .select("medication_id")
        .eq("user_id", userId)
        .eq("medication_id", medicationId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    async setTaken(medicationId, date, taken) {
      if (!taken) {
        const existingRecord = await findByMedicationAndDate(medicationId, date);
        if (!existingRecord) return null;

        const { data, error } = await supabase
          .from("medication_intake_records")
          .delete()
          .eq("user_id", userId)
          .eq("medication_id", medicationId)
          .eq("intake_date", date)
          .select(INTAKE_COLUMNS)
          .maybeSingle();
        if (error) throw error;
        if (!data && await findByMedicationAndDate(medicationId, date)) {
          throw new Error("복용 취소를 저장하지 못했어요.");
        }
        return null;
      }

      const row = toSupabaseMedicationIntake(
        medicationId,
        date,
        new Date().toISOString(),
        userId,
      );
      const { data, error } = await supabase
        .from("medication_intake_records")
        .upsert(row, {
          onConflict: "user_id,medication_id,intake_date",
          ignoreDuplicates: true,
        })
        .select(INTAKE_COLUMNS)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        return fromSupabaseMedicationIntake(
          data as unknown as SupabaseMedicationIntakeRow,
        );
      }
      return findByMedicationAndDate(medicationId, date);
    },
    async updateRecordedAt(medicationId, date, recordedAt) {
      const { data, error } = await supabase
        .from("medication_intake_records")
        .update({ recorded_at: recordedAt })
        .eq("user_id", userId)
        .eq("medication_id", medicationId)
        .eq("intake_date", date)
        .select(INTAKE_COLUMNS)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("수정할 복용 완료 기록을 찾지 못했어요.");
      return fromSupabaseMedicationIntake(
        data as unknown as SupabaseMedicationIntakeRow,
      );
    },
    async migrateInitial(records) {
      const { data, error } = await supabase.rpc(
        "migrate_initial_medication_intake_records",
        {
          p_records: records.map(toSupabaseMedicationIntakeMigrationInput),
        },
      );
      if (error) throw error;

      const result = data?.[0] as {
        migrated: boolean;
        inserted_count: number;
        skipped_count: number;
      } | undefined;
      return {
        migrated: result?.migrated ?? false,
        insertedCount: result?.inserted_count ?? 0,
        skippedCount: result?.skipped_count ?? 0,
      };
    },
  };
}
