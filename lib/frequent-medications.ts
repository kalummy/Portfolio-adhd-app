import { MEDICATION_FALLBACK_IMAGE } from "./medication-utils";
import { resolveMedicationImage } from "./medication-images";
import type { MedicationCandidate } from "./types";

type FrequentMedicationGroup = {
  name: string;
  englishName: string;
  manufacturer: string;
  strengths: number[];
};

const FREQUENT_MEDICATION_GROUPS: FrequentMedicationGroup[] = [
  {
    name: "콘서타OROS서방정",
    englishName: "Concerta Oros Tablet",
    manufacturer: "(주)한국얀센",
    strengths: [18, 27, 36, 54],
  },
  {
    name: "메디키넷리타드캡슐",
    englishName: "Medikinet Retard Capsule",
    manufacturer: "명인제약(주)",
    strengths: [5, 10, 20, 30, 40],
  },
  {
    name: "아토목신캡슐",
    englishName: "Atomoxine Capsule",
    manufacturer: "명인제약(주)",
    strengths: [10, 18, 25, 40, 60, 80],
  },
];

export const FREQUENT_MEDICATIONS: MedicationCandidate[] =
  FREQUENT_MEDICATION_GROUPS.flatMap(({ name, englishName, manufacturer, strengths }) => (
    strengths.map((strengthValue) => {
      const label = `${name} ${strengthValue}mg`;
      const image = resolveMedicationImage({ medicationName: label });
      return {
        displayLabel: label,
        name,
        englishName: `${englishName} ${strengthValue}mg`,
        strengthValue,
        strengthUnit: "mg" as const,
        manufacturer,
        imagePath: image.src,
        productImage: image.type === "product" ? image.src : undefined,
        fallbackImage: MEDICATION_FALLBACK_IMAGE,
        imageType: image.type,
      };
    })
  ));
