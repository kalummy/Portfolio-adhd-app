import { getKstDateKey } from "./kst-date";
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
  const actualIntakeIds = new Set(
    intakeRecords
      .filter((record) => record.date === selectedDate && record.taken === true)
      .map((record) => record.medicationId),
  );
  const projectedMedicationIds = new Set<string>();

  return medications.filter((medication) => {
    const hasActualIntake = actualIntakeIds.has(medication.id);
    const createdAt = new Date(medication.createdAt);
    // There is no separate schedule start date in the current medication schema.
    // Use the registration day in KST, retaining legacy records with an invalid timestamp.
    const registeredDate = Number.isNaN(createdAt.getTime())
      ? null
      : getKstDateKey(createdAt);
    const started = registeredDate === null || selectedDate >= registeredDate;
    const shouldDisplay = (medication.active !== false || (selectedDate < todayDate && hasActualIntake))
      && (started || hasActualIntake);
    if (!shouldDisplay || projectedMedicationIds.has(medication.id)) return false;

    projectedMedicationIds.add(medication.id);
    return true;
  });
}
