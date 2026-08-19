import {
  findClaimedGuestIntakeRecoveryCandidates,
  type ClaimedGuestIntakeRecoveryCandidate,
  type ReservedGuestMedicationDataset,
} from "@/lib/indexed-db";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  toSupabaseMedicationIntakeMigrationInput,
} from "./intake-records/mapper";
import type { ServerMedicationRepository } from "./medications/types";
import { toSupabaseMedicationMigrationInput } from "./medications/mapper";
import { toSupabaseVisitScheduleMigrationInput } from "./visit-schedules/mapper";
import { toSupabaseMoodMigrationInput } from "./moods/mapper";

export type GuestDatasetMergeConflict = {
  code: string;
  medicationId?: string;
  intakeRecordId?: string;
  message: string;
};

export type GuestDatasetMergeResult = {
  success: boolean;
  claimed: boolean;
  insertedMedicationCount: number;
  reusedMedicationCount: number;
  insertedIntakeCount: number;
  existingIntakeCount: number;
  insertedVisitCount: number;
  reusedVisitCount: number;
  insertedMoodCount: number;
  existingMoodCount: number;
  conflicts: GuestDatasetMergeConflict[];
  failureReason?: string;
};

type GuestDatasetMergeRpcResult = {
  success?: boolean;
  claimed?: boolean;
  inserted_medication_count?: number;
  reused_medication_count?: number;
  inserted_intake_count?: number;
  existing_intake_count?: number;
  inserted_visit_count?: number;
  reused_visit_count?: number;
  inserted_mood_count?: number;
  existing_mood_count?: number;
  conflicts?: GuestDatasetMergeConflict[];
  failure_reason?: string | null;
};

function toGuestDatasetMergeResult(
  row: GuestDatasetMergeRpcResult | undefined,
): GuestDatasetMergeResult {
  return {
    success: row?.success ?? false,
    claimed: row?.claimed ?? false,
    insertedMedicationCount: row?.inserted_medication_count ?? 0,
    reusedMedicationCount: row?.reused_medication_count ?? 0,
    insertedIntakeCount: row?.inserted_intake_count ?? 0,
    existingIntakeCount: row?.existing_intake_count ?? 0,
    insertedVisitCount: row?.inserted_visit_count ?? 0,
    reusedVisitCount: row?.reused_visit_count ?? 0,
    insertedMoodCount: row?.inserted_mood_count ?? 0,
    existingMoodCount: row?.existing_mood_count ?? 0,
    conflicts: row?.conflicts ?? [],
    failureReason: row?.failure_reason ?? undefined,
  };
}

export async function mergeGuestMedicationDataset(
  dataset: ReservedGuestMedicationDataset,
): Promise<GuestDatasetMergeResult> {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.rpc("merge_guest_medication_dataset", {
    p_dataset_id: dataset.datasetId,
    p_medications: dataset.medications.map(toSupabaseMedicationMigrationInput),
    p_intakes: dataset.intakeRecords.map(toSupabaseMedicationIntakeMigrationInput),
  });
  if (error) throw error;

  return toGuestDatasetMergeResult(data?.[0] as GuestDatasetMergeRpcResult | undefined);
}

export async function mergeGuestDataset(
  dataset: ReservedGuestMedicationDataset,
): Promise<GuestDatasetMergeResult> {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.rpc("merge_guest_dataset", {
    p_dataset_id: dataset.datasetId,
    p_medications: dataset.medications.map(toSupabaseMedicationMigrationInput),
    p_intakes: dataset.intakeRecords.map(toSupabaseMedicationIntakeMigrationInput),
    p_visit: dataset.visitSchedule
      ? toSupabaseVisitScheduleMigrationInput(dataset.visitSchedule)
      : null,
    p_moods: dataset.moodRecords.map(toSupabaseMoodMigrationInput),
  });
  if (error) throw error;

  return toGuestDatasetMergeResult(data?.[0] as GuestDatasetMergeRpcResult | undefined);
}

export async function diagnoseClaimedGuestIntakeRecoveryCandidates(
  userId: string,
  medicationRepository: ServerMedicationRepository,
): Promise<ClaimedGuestIntakeRecoveryCandidate[]> {
  const provisionalCandidates = await findClaimedGuestIntakeRecoveryCandidates(userId, []);
  const candidateMedicationIds = uniqueIds(
    provisionalCandidates.map((candidate) => candidate.medication.id),
  );
  const existingServerMedications = await medicationRepository.getByIds(candidateMedicationIds);
  return findClaimedGuestIntakeRecoveryCandidates(
    userId,
    existingServerMedications.map((medication) => medication.id),
  );
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids)];
}
