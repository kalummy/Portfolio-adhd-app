import type { MedicationCandidate } from "./types";

type MedicationDetailResponse = {
  medication?: MedicationCandidate;
};

export function needsOfficialMedicationEnrichment(medication: MedicationCandidate) {
  return Boolean(
    medication.catalogId
    && (
      !medication.displayLabel
      || !medication.ingredientName
      || !medication.manufacturer
      || !medication.englishName
      || !medication.productImage
      || !medication.imageSourceName
      || !medication.imageSourceUrl
      || medication.imageType !== "product"
      || medication.officialMatchStatus !== "matched"
    )
  );
}

export async function enrichOfficialMedication<T extends MedicationCandidate>(
  medication: T,
): Promise<T> {
  if (!needsOfficialMedicationEnrichment(medication) || !medication.catalogId) {
    return medication;
  }

  try {
    const response = await fetch(
      `/api/medications/${encodeURIComponent(medication.catalogId)}`,
    );
    if (!response.ok) return medication;

    const payload = await response.json() as MedicationDetailResponse;
    if (!payload.medication || payload.medication.catalogId !== medication.catalogId) {
      return medication;
    }

    return { ...medication, ...payload.medication };
  } catch {
    return medication;
  }
}

export function enrichOfficialMedications<T extends MedicationCandidate>(medications: T[]) {
  return Promise.all(medications.map(enrichOfficialMedication));
}
