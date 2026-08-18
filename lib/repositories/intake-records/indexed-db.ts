import {
  getMedicationIntakeRecords,
  getMedicationIntakeRecordsByDate,
  hasMedicationIntakeHistory,
  setMedicationTaken,
} from "@/lib/indexed-db";
import type { MedicationIntakeRepository } from "./types";

export const indexedDbMedicationIntakeRepository: MedicationIntakeRepository = {
  listAll: getMedicationIntakeRecords,
  listByDate: getMedicationIntakeRecordsByDate,
  hasHistory: hasMedicationIntakeHistory,
  setTaken: setMedicationTaken,
  async migrateInitial() {
    return { migrated: false, insertedCount: 0, skippedCount: 0 };
  },
};
