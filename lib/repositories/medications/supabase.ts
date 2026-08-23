import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { SavedMedication } from "@/lib/types";
import {
  fromSupabaseMedication,
  toSupabaseMedication,
  toSupabaseMedicationMigrationInput,
  type SupabaseMedicationRow,
} from "./mapper";
import type { ServerMedicationRepository } from "./types";

const MEDICATION_COLUMNS = [
  "id", "user_id", "catalog_id", "display_label", "name", "ingredient_name",
  "strength_value", "strength_unit", "manufacturer", "english_name", "image_path",
  "product_image", "fallback_image", "image_type", "image_source_name",
  "image_source_url", "search_keywords", "official_match_status",
  "registration_method", "schedule", "scheduled_time", "active", "deactivated_at", "created_at", "updated_at",
].join(",");

function sortByCreatedAt(medications: SavedMedication[]) {
  return medications.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function createSupabaseMedicationRepository(userId: string): ServerMedicationRepository {
  const supabase = createBrowserSupabaseClient();

  async function list(activeOnly: boolean) {
    let query = supabase
      .from("user_medications")
      .select(MEDICATION_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (activeOnly) query = query.eq("active", true);

    const { data, error } = await query;
    if (error) throw error;
    return sortByCreatedAt(
      (data as unknown as SupabaseMedicationRow[]).map(fromSupabaseMedication),
    );
  }

  return {
    listActive: () => list(true),
    listAll: () => list(false),
    async createMany(medications) {
      if (medications.length === 0) return [];
      const rows = medications.map((medication) => toSupabaseMedication(medication, userId));
      const { data, error } = await supabase
        .from("user_medications")
        .upsert(rows, { onConflict: "user_id,id" })
        .select(MEDICATION_COLUMNS);
      if (error) throw error;

      const byId = new Map(
        (data as unknown as SupabaseMedicationRow[])
          .map(fromSupabaseMedication)
          .map((medication) => [medication.id, medication]),
      );
      return medications.map((medication) => byId.get(medication.id) ?? medication);
    },
    async migrateInitial(medications) {
      const rows = medications.map(toSupabaseMedicationMigrationInput);
      const { data, error } = await supabase.rpc("migrate_initial_user_medications", {
        p_medications: rows,
      });
      if (error) throw error;

      const result = data?.[0] as {
        migrated: boolean;
        inserted_count: number;
      } | undefined;
      return {
        migrated: result?.migrated ?? false,
        insertedCount: result?.inserted_count ?? 0,
      };
    },
    async deactivate(id) {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("user_medications")
        .update({ active: false, deactivated_at: now, updated_at: now })
        .eq("user_id", userId)
        .eq("id", id)
        .select(MEDICATION_COLUMNS)
        .single();
      if (error) throw error;
      return fromSupabaseMedication(data as unknown as SupabaseMedicationRow);
    },
    async updateSchedule(id, patch) {
      const now = new Date().toISOString();
      const updates: {
        schedule?: SavedMedication["schedule"];
        scheduled_time?: string | null;
        updated_at: string;
      } = { updated_at: now };
      if (Object.hasOwn(patch, "schedule")) updates.schedule = patch.schedule;
      if (Object.hasOwn(patch, "scheduledTime")) {
        updates.scheduled_time = patch.scheduledTime ?? null;
      }

      const { data, error } = await supabase
        .from("user_medications")
        .update(updates)
        .eq("user_id", userId)
        .eq("id", id)
        .select(MEDICATION_COLUMNS)
        .single();
      if (error) throw error;
      return fromSupabaseMedication(data as unknown as SupabaseMedicationRow);
    },
    async getByIds(ids) {
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("user_medications")
        .select(MEDICATION_COLUMNS)
        .eq("user_id", userId)
        .in("id", ids);
      if (error) throw error;
      const byId = new Map(
        (data as unknown as SupabaseMedicationRow[])
          .map(fromSupabaseMedication)
          .map((medication) => [medication.id, medication]),
      );
      return ids.flatMap((id) => {
        const medication = byId.get(id);
        return medication ? [medication] : [];
      });
    },
  };
}
