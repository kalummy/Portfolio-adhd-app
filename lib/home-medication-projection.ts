import type { MedicationIntakeRecord, SavedMedication } from "./types";

export function getHomeMedicationProjection({
  medications,
  intakeRecords,
  selectedDate,
  todayDate,
}: {
  medications: SavedMedication[];
  intakeRecords: MedicationIntakeRecord[];
  selectedDate: string;
  todayDate: string;
}) {
  const historicalMedicationIds = new Set(
    selectedDate < todayDate
      ? intakeRecords
          .filter((record) => record.date === selectedDate && record.taken === true)
          .map((record) => record.medicationId)
      : [],
  );
  const projectedMedicationIds = new Set<string>();

  return medications.filter((medication) => {
    const shouldDisplay = medication.active !== false
      || historicalMedicationIds.has(medication.id);
    if (!shouldDisplay || projectedMedicationIds.has(medication.id)) return false;

    projectedMedicationIds.add(medication.id);
    return true;
  });
}
