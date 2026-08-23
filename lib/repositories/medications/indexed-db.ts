import {
  deactivateSavedMedication,
  getAllSavedMedications,
  getSavedMedications,
  getSavedMedicationsByIds,
  saveSavedMedications,
  updateSavedMedicationSchedule,
} from "@/lib/indexed-db";
import type { MedicationRepository } from "./types";

export const indexedDbMedicationRepository: MedicationRepository = {
  listActive: getSavedMedications,
  listAll: getAllSavedMedications,
  async createMany(medications) {
    await saveSavedMedications(medications);
    return medications;
  },
  deactivate: deactivateSavedMedication,
  updateSchedule: updateSavedMedicationSchedule,
  getByIds: getSavedMedicationsByIds,
};
