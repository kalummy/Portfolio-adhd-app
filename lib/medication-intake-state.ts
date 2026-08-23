import type { MedicationIntakeRecord } from "./types";

export function reconcileMedicationIntakeRecord(
  records: MedicationIntakeRecord[],
  medicationId: string,
  date: string,
  savedRecord: MedicationIntakeRecord | null,
) {
  const remainingRecords = records.filter((record) => (
    record.medicationId !== medicationId || record.date !== date
  ));

  return savedRecord?.taken === true
    ? [...remainingRecords, savedRecord]
    : remainingRecords;
}
