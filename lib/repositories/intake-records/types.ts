import type { MedicationIntakeRecord } from "@/lib/types";

export type InitialMedicationIntakeMigrationResult = {
  migrated: boolean;
  insertedCount: number;
  skippedCount: number;
};

export interface MedicationIntakeRepository {
  listAll(): Promise<MedicationIntakeRecord[]>;
  listByDate(date: string): Promise<MedicationIntakeRecord[]>;
  hasHistory(medicationId: string): Promise<boolean>;
  setTaken(
    medicationId: string,
    date: string,
    taken: boolean,
  ): Promise<MedicationIntakeRecord | null>;
  updateRecordedAt(
    medicationId: string,
    date: string,
    recordedAt: string,
  ): Promise<MedicationIntakeRecord>;
  migrateInitial(
    records: MedicationIntakeRecord[],
  ): Promise<InitialMedicationIntakeMigrationResult>;
}
