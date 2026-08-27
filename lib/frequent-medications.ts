import { MEDICATION_FALLBACK_IMAGE } from "./medication-utils";
import { resolveMedicationImage } from "./medication-images";
import type { MedicationCandidate } from "./types";

export type FrequentMedicationGroup = {
  id: string;
  label: string;
  name: string;
  englishName: string;
  manufacturer: string;
  strengths: number[];
};

export const FREQUENT_MEDICATION_GROUPS: FrequentMedicationGroup[] = [
  {
    id: "concerta",
    label: "콘서타",
    name: "콘서타OROS서방정",
    englishName: "Concerta Oros Tablet",
    manufacturer: "(주)한국얀센",
    strengths: [18, 27, 36, 54],
  },
  {
    id: "medikinet",
    label: "메디키넷",
    name: "메디키넷리타드캡슐",
    englishName: "Medikinet Retard Capsule",
    manufacturer: "명인제약(주)",
    strengths: [5, 10, 20, 30, 40],
  },
  {
    id: "atomoxine",
    label: "아토목신",
    name: "아토목신캡슐",
    englishName: "Atomoxine Capsule",
    manufacturer: "명인제약(주)",
    strengths: [10, 18, 25, 40, 60, 80],
  },
];

export function getFrequentMedicationGroup(id: string | null | undefined) {
  if (!id) return undefined;
  return FREQUENT_MEDICATION_GROUPS.find((group) => group.id === id);
}

export function createFrequentMedicationCandidate(
  group: FrequentMedicationGroup,
  strengthValue: number,
): MedicationCandidate {
  const label = `${group.name} ${strengthValue}mg`;
  const image = resolveMedicationImage({ medicationName: label });
  return {
    displayLabel: label,
    name: group.name,
    englishName: `${group.englishName} ${strengthValue}mg`,
    strengthValue,
    strengthUnit: "mg",
    manufacturer: group.manufacturer,
    imagePath: image.src,
    productImage: image.type === "product" ? image.src : undefined,
    fallbackImage: MEDICATION_FALLBACK_IMAGE,
    imageType: image.type,
  };
}
