import type { MedicationIntakeRecord } from "@/lib/types";

export type SupabaseMedicationIntakeRow = {
  user_id: string;
  medication_id: string;
  intake_date: string;
  recorded_at: string;
};

export type SupabaseMedicationIntakeMigrationInput = {
  medication_id: string;
  intake_date: string;
  recorded_at: string;
  taken: boolean;
};

export function fromSupabaseMedicationIntake(
  row: SupabaseMedicationIntakeRow,
): MedicationIntakeRecord {
  return {
    id: `${row.intake_date}:${row.medication_id}`,
    medicationId: row.medication_id,
    date: row.intake_date,
    taken: true,
    recordedAt: row.recorded_at,
  };
}

export function toSupabaseMedicationIntake(
  medicationId: string,
  date: string,
  recordedAt: string,
  userId: string,
): SupabaseMedicationIntakeRow {
  return {
    user_id: userId,
    medication_id: medicationId,
    intake_date: date,
    recorded_at: recordedAt,
  };
}

export function toSupabaseMedicationIntakeMigrationInput(
  record: MedicationIntakeRecord,
): SupabaseMedicationIntakeMigrationInput {
  return {
    medication_id: record.medicationId,
    intake_date: record.date,
    recorded_at: record.recordedAt,
    taken: record.taken,
  };
}
