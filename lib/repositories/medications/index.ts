import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { indexedDbMedicationRepository } from "./indexed-db";
import { createSupabaseMedicationRepository } from "./supabase";
import type { MedicationRepository, ServerMedicationRepository } from "./types";

const initialMigrationByUser = new Map<string, Promise<void>>();

async function migrateLocalMedicationsWhenServerIsEmpty(
  userId: string,
  repository: ServerMedicationRepository,
) {
  const existing = initialMigrationByUser.get(userId);
  if (existing) return existing;

  const migration = (async () => {
    const localMedications = await indexedDbMedicationRepository.listAll();
    await repository.migrateInitial(localMedications);
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

export async function getMedicationRepository(): Promise<MedicationRepository> {
  const supabase = createBrowserSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) return indexedDbMedicationRepository;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw userError ?? new Error("로그인 사용자를 확인하지 못했어요.");
  }

  const repository = createSupabaseMedicationRepository(userData.user.id);
  await migrateLocalMedicationsWhenServerIsEmpty(userData.user.id, repository);
  return repository;
}

export { createSavedMedicationsFromDraft } from "./create";
export type { MedicationRepository } from "./types";
