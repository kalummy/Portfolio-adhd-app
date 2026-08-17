import type { SavedMedication } from "@/lib/types";

export interface MedicationRepository {
  listActive(): Promise<SavedMedication[]>;
  listAll(): Promise<SavedMedication[]>;
  createMany(medications: SavedMedication[]): Promise<SavedMedication[]>;
  deactivate(id: string): Promise<SavedMedication>;
  getByIds(ids: string[]): Promise<SavedMedication[]>;
}

export type InitialMedicationMigrationResult = {
  migrated: boolean;
  insertedCount: number;
};

export interface ServerMedicationRepository extends MedicationRepository {
  migrateInitial(
    medications: SavedMedication[],
  ): Promise<InitialMedicationMigrationResult>;
}
