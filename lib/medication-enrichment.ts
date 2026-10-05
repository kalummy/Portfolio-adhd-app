import type { MedicationCandidate } from "./types";
import { isMedicationFallbackImage } from "./medication-images";

type MedicationDetailResponse = {
  medication?: MedicationCandidate;
};

export function needsOfficialMedicationEnrichment(medication: MedicationCandidate) {
  return Boolean(
    medication.catalogId
    && /^\d{9}$/.test(medication.catalogId)
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

    const hasSavedProductImage = [medication.productImage, medication.imagePath]
      .some((source) => source?.trim() && !isMedicationFallbackImage(source.trim()));
    return {
      ...medication,
      ...payload.medication,
      ...(hasSavedProductImage ? {
        imagePath: medication.imagePath,
        productImage: medication.productImage,
        fallbackImage: medication.fallbackImage,
        imageType: medication.imageType,
        imageSourceName: medication.imageSourceName,
        imageSourceUrl: medication.imageSourceUrl,
      } : {}),
    };
  } catch {
    return medication;
  }
}

export function enrichOfficialMedications<T extends MedicationCandidate>(medications: T[]) {
  return Promise.all(medications.map(enrichOfficialMedication));
}
