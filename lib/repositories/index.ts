import {
  completeGuestMedicationDatasetClaim,
  completeMedicationIntakeDatasetClaim,
  releaseGuestMedicationDatasetReservation,
  releaseMedicationIntakeDatasetReservation,
  reserveGuestMedicationDatasetForUser,
  reserveMedicationIntakeDatasetForUser,
} from "@/lib/indexed-db";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { mergeGuestDataset } from "./guest-dataset";
import {
  bootstrapGuestDataset,
  type GuestDatasetBootstrapResult,
} from "./guest-dataset-bootstrap";
import { indexedDbMedicationIntakeRepository } from "./intake-records/indexed-db";
import { createSupabaseMedicationIntakeRepository } from "./intake-records/supabase";
import type { MedicationIntakeRepository } from "./intake-records/types";
import { indexedDbMedicationRepository } from "./medications/indexed-db";
import { createSupabaseMedicationRepository } from "./medications/supabase";
import type { MedicationRepository, ServerMedicationRepository } from "./medications/types";
import { indexedDbMoodRepository } from "./moods/indexed-db";
import { createSupabaseMoodRepository } from "./moods/supabase";
import type { MoodRepository } from "./moods/types";
import { indexedDbVisitScheduleRepository } from "./visit-schedules/indexed-db";
import { createSupabaseVisitScheduleRepository } from "./visit-schedules/supabase";
import type { VisitScheduleRepository } from "./visit-schedules/types";

export type DataRepositories = {
  medications: MedicationRepository;
  medicationIntakes: MedicationIntakeRepository;
  moods: MoodRepository;
  visitSchedules: VisitScheduleRepository;
};

const initialMigrationByUser = new Map<string, Promise<GuestDatasetBootstrapResult>>();
const failedGuestDatasetSyncByUser = new Map<string, GuestDatasetBootstrapResult>();
const completedGuestDatasetSyncByUser = new Map<string, GuestDatasetBootstrapResult>();

// Deprecated compatibility path. New guest data ownership uses mergeLocalGuestDataset.
async function migrateLocalMedicationsWhenServerIsEmpty(
  repository: ServerMedicationRepository,
) {
  const localMedications = await indexedDbMedicationRepository.listAll();
  await repository.migrateInitial(localMedications);
}

// Deprecated compatibility path. Kept so the old RPC contract is still available.
async function migrateAndClaimLocalMedicationIntakes(
  userId: string,
  repository: MedicationIntakeRepository,
) {
  const reservation = await reserveMedicationIntakeDatasetForUser(userId);
  if (!reservation) return;

  try {
    await repository.migrateInitial(reservation.records);
    await completeMedicationIntakeDatasetClaim(reservation.datasetId, userId);
  } catch (error) {
    try {
      await releaseMedicationIntakeDatasetReservation(reservation.datasetId, userId);
    } catch {
      // Preserve the migration error. A same-user retry remains idempotent on the server.
    }
    throw error;
  }
}

async function mergeLocalGuestDataset(userId: string) {
  return bootstrapGuestDataset({
    userId,
    reserve: reserveGuestMedicationDatasetForUser,
    merge: mergeGuestDataset,
    complete: completeGuestMedicationDatasetClaim,
    release: releaseGuestMedicationDatasetReservation,
  });
}

async function migrateInitialLocalData(
  userId: string,
  retry = false,
) {
  if (retry) {
    failedGuestDatasetSyncByUser.delete(userId);
    completedGuestDatasetSyncByUser.delete(userId);
  }
  const failed = failedGuestDatasetSyncByUser.get(userId);
  if (failed) return failed;
  const completed = completedGuestDatasetSyncByUser.get(userId);
  if (completed) return completed;

  const existing = initialMigrationByUser.get(userId);
  if (existing) return existing;

  const migration = mergeLocalGuestDataset(userId);

  initialMigrationByUser.set(userId, migration);
  try {
    const result = await migration;
    if (result.status === "failed") {
      failedGuestDatasetSyncByUser.set(userId, result);
    } else {
      completedGuestDatasetSyncByUser.set(userId, result);
    }
    return result;
  } finally {
    if (initialMigrationByUser.get(userId) === migration) {
      initialMigrationByUser.delete(userId);
    }
  }
}

export async function getDataRepositories(): Promise<DataRepositories> {
  if (!isSupabaseConfigured()) {
    return {
      medications: indexedDbMedicationRepository,
      medicationIntakes: indexedDbMedicationIntakeRepository,
      moods: indexedDbMoodRepository,
      visitSchedules: indexedDbVisitScheduleRepository,
    };
  }

  const supabase = createBrowserSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw userError ?? new Error("로그인 사용자를 확인하지 못했어요.");
  }

  const medicationRepository = createSupabaseMedicationRepository(userData.user.id);
  const intakeRepository = createSupabaseMedicationIntakeRepository(userData.user.id);
  const moodRepository = createSupabaseMoodRepository(userData.user.id);
  const visitScheduleRepository = createSupabaseVisitScheduleRepository(userData.user.id);

  return {
    medications: medicationRepository,
    medicationIntakes: intakeRepository,
    moods: moodRepository,
    visitSchedules: visitScheduleRepository,
  };
}

export async function runGuestDatasetSyncInBackground(): Promise<GuestDatasetBootstrapResult> {
  if (!isSupabaseConfigured()) return { status: "no-local-data" };

  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw error ?? new Error("로그인 사용자를 확인하지 못했어요.");
  }

  return migrateInitialLocalData(data.user.id);
}

export async function retryGuestDatasetSync(): Promise<GuestDatasetBootstrapResult> {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw error ?? new Error("로그인 사용자를 확인하지 못했어요.");
  }

  return migrateInitialLocalData(data.user.id, true);
}

export async function getMedicationRepository(): Promise<MedicationRepository> {
  return (await getDataRepositories()).medications;
}

export async function getMedicationIntakeRepository(): Promise<MedicationIntakeRepository> {
  return (await getDataRepositories()).medicationIntakes;
}

export async function getMoodRepository(): Promise<MoodRepository> {
  return (await getDataRepositories()).moods;
}

export async function getVisitScheduleRepository(): Promise<VisitScheduleRepository> {
  return (await getDataRepositories()).visitSchedules;
}

export { diagnoseClaimedGuestIntakeRecoveryCandidates } from "./guest-dataset";
export type { MedicationIntakeRepository } from "./intake-records/types";
export type { MedicationRepository } from "./medications/types";
export type { MoodRepository } from "./moods/types";
export type { VisitScheduleRepository } from "./visit-schedules/types";
