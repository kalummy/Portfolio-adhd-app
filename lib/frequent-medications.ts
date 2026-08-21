import { MEDICATION_FALLBACK_IMAGE } from "./medication-utils";
import type { MedicationCandidate } from "./types";

type FrequentMedicationGroup = {
  name: string;
  englishName: string;
  manufacturer: string;
  strengths: number[];
  productImages?: Partial<Record<number, string>>;
};

const FREQUENT_MEDICATION_GROUPS: FrequentMedicationGroup[] = [
  {
    name: "콘서타OROS서방정",
    englishName: "Concerta Oros Tablet",
    manufacturer: "(주)한국얀센",
    strengths: [18, 27, 36, 54],
    productImages: { 36: "/medications/concerta-36.png" },
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
    productImages: { 40: "/medications/preview-atomoxetine-40.png" },
  },
];

export const FREQUENT_MEDICATIONS: MedicationCandidate[] =
  FREQUENT_MEDICATION_GROUPS.flatMap(({ name, englishName, manufacturer, strengths, productImages }) => (
    strengths.map((strengthValue) => {
      const productImage = productImages?.[strengthValue];
      return {
        displayLabel: `${name} ${strengthValue}mg`,
        name,
        englishName: `${englishName} ${strengthValue}mg`,
        strengthValue,
        strengthUnit: "mg" as const,
        manufacturer,
        imagePath: productImage ?? MEDICATION_FALLBACK_IMAGE,
        productImage,
        fallbackImage: MEDICATION_FALLBACK_IMAGE,
        imageType: productImage ? "product" as const : "fallback" as const,
      };
    })
  ));
