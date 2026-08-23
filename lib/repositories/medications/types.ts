import type { MedicationSchedule, SavedMedication } from "@/lib/types";

export type MedicationSchedulePatch = {
  schedule?: MedicationSchedule;
  scheduledTime?: string | null;
};

export interface MedicationRepository {
  listActive(): Promise<SavedMedication[]>;
  listAll(): Promise<SavedMedication[]>;
  createMany(medications: SavedMedication[]): Promise<SavedMedication[]>;
  deactivate(id: string): Promise<SavedMedication>;
  updateSchedule(id: string, patch: MedicationSchedulePatch): Promise<SavedMedication>;
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
