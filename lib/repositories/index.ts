import {
  completeMedicationIntakeDatasetClaim,
  releaseMedicationIntakeDatasetReservation,
  reserveMedicationIntakeDatasetForUser,
} from "@/lib/indexed-db";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { indexedDbMedicationIntakeRepository } from "./intake-records/indexed-db";
import { createSupabaseMedicationIntakeRepository } from "./intake-records/supabase";
import type { MedicationIntakeRepository } from "./intake-records/types";
import { indexedDbMedicationRepository } from "./medications/indexed-db";
import { createSupabaseMedicationRepository } from "./medications/supabase";
import type { MedicationRepository, ServerMedicationRepository } from "./medications/types";

export type DataRepositories = {
  medications: MedicationRepository;
  medicationIntakes: MedicationIntakeRepository;
};

const initialMigrationByUser = new Map<string, Promise<void>>();

async function migrateLocalMedicationsWhenServerIsEmpty(
  repository: ServerMedicationRepository,
) {
  const localMedications = await indexedDbMedicationRepository.listAll();
  await repository.migrateInitial(localMedications);
}

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

async function migrateInitialLocalData(
  userId: string,
  medicationRepository: ServerMedicationRepository,
  intakeRepository: MedicationIntakeRepository,
) {
  const existing = initialMigrationByUser.get(userId);
  if (existing) return existing;

  const migration = (async () => {
    await migrateLocalMedicationsWhenServerIsEmpty(medicationRepository);
    await migrateAndClaimLocalMedicationIntakes(userId, intakeRepository);
  })();

  initialMigrationByUser.set(userId, migration);
  try {
    await migration;
  } finally {
    if (initialMigrationByUser.get(userId) === migration) {
      initialMigrationByUser.delete(userId);
    }
  }
}

export async function getDataRepositories(): Promise<DataRepositories> {
  const supabase = createBrowserSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) {
    return {
      medications: indexedDbMedicationRepository,
      medicationIntakes: indexedDbMedicationIntakeRepository,
    };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw userError ?? new Error("로그인 사용자를 확인하지 못했어요.");
  }

  const medicationRepository = createSupabaseMedicationRepository(userData.user.id);
  const intakeRepository = createSupabaseMedicationIntakeRepository(userData.user.id);
  await migrateInitialLocalData(
    userData.user.id,
    medicationRepository,
    intakeRepository,
  );

  return {
    medications: medicationRepository,
    medicationIntakes: intakeRepository,
  };
}

export async function getMedicationRepository(): Promise<MedicationRepository> {
  return (await getDataRepositories()).medications;
}

export async function getMedicationIntakeRepository(): Promise<MedicationIntakeRepository> {
  return (await getDataRepositories()).medicationIntakes;
}

export type { MedicationIntakeRepository } from "./intake-records/types";
export type { MedicationRepository } from "./medications/types";
