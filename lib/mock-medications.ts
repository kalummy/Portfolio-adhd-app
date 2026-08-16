import type { MedicationCandidate } from "./types";
import { MEDICATION_FALLBACK_IMAGE, medicationLabel } from "./medication-utils";

type MockMedication = MedicationCandidate & {
  catalogId: string;
  ingredientName: string;
  fallbackImage: string;
  imageType: "product" | "fallback";
  searchKeywords: string[];
};

type CatalogDefinition = {
  id: string;
  productName: string;
  ingredientName: string;
  strengths: number[];
  manufacturer: string;
  englishName: string;
  searchKeywords: string[];
  productImageForStrength?: (strength: number) => string | undefined;
  imageSourceName?: string;
  imageSourceUrl?: string;
};

function catalogItems({
  id,
  productName,
  ingredientName,
  strengths,
  manufacturer,
  englishName,
  searchKeywords,
  productImageForStrength,
  imageSourceName,
  imageSourceUrl,
}: CatalogDefinition): MockMedication[] {
  return strengths.map((strengthValue) => {
    const productImage = productImageForStrength?.(strengthValue);

    return {
      catalogId: `${id}-${String(strengthValue).replace(".", "-")}`,
      name: productName,
      ingredientName,
      strengthValue,
      strengthUnit: "mg",
      manufacturer,
      englishName: `${englishName} ${strengthValue}mg`,
      imagePath: productImage ?? MEDICATION_FALLBACK_IMAGE,
      productImage,
      fallbackImage: MEDICATION_FALLBACK_IMAGE,
      imageType: productImage ? "product" : "fallback",
      imageSourceName: productImage ? imageSourceName : undefined,
      imageSourceUrl: productImage ? imageSourceUrl : undefined,
      searchKeywords: [productName, ingredientName, englishName, ...searchKeywords],
    };
  });
}

export const MOCK_MEDICATIONS: MockMedication[] = [
  ...catalogItems({
    id: "concerta-oros",
    productName: "콘서타OROS서방정",
    ingredientName: "메틸페니데이트염산염",
    strengths: [18, 27, 36, 54],
    manufacturer: "(주)한국얀센",
    englishName: "Concerta OROS Tablet",
    searchKeywords: ["콘서타", "콘서", "methylphenidate", "메틸페니데이트"],
    productImageForStrength: (strength) => strength === 36 ? "/medications/concerta-36.png" : undefined,
    imageSourceName: "약학정보원 의약품식별정보",
    imageSourceUrl: "https://www.health.kr/searchDrug/result_take.asp?drug_cd=2015031200004",
  }),
  ...catalogItems({
    id: "medikinet-retard",
    productName: "메디키넷리타드캡슐",
    ingredientName: "메틸페니데이트염산염",
    strengths: [5, 10, 20, 30, 40],
    manufacturer: "명인제약(주)",
    englishName: "Medikinet Retard Capsule",
    searchKeywords: ["메디키넷", "메디", "methylphenidate", "메틸페니데이트"],
  }),
  ...catalogItems({
    id: "strattera",
    productName: "스트라테라캡슐",
    ingredientName: "아토목세틴염산염",
    strengths: [10, 18, 25, 40, 60, 80],
    manufacturer: "한국릴리(유)",
    englishName: "Strattera Capsule",
    searchKeywords: ["스트라테라", "스트라", "atomoxetine", "아토목세틴", "아토목"],
  }),
  ...catalogItems({
    id: "lexapro",
    productName: "렉사프로정",
    ingredientName: "에스시탈로프람옥살산염",
    strengths: [5, 10, 20],
    manufacturer: "한국룬드벡(주)",
    englishName: "Lexapro Tablet",
    searchKeywords: ["렉사프로", "렉사", "escitalopram", "에스시탈로프람", "에스시"],
  }),
  ...catalogItems({
    id: "zoloft",
    productName: "졸로푸트정",
    ingredientName: "설트랄린염산염",
    strengths: [50, 100],
    manufacturer: "비아트리스코리아(주)",
    englishName: "Zoloft Tablet",
    searchKeywords: ["졸로푸트", "졸로", "sertraline", "설트랄린", "설트"],
  }),
  ...catalogItems({
    id: "prozac",
    productName: "푸로작캡슐",
    ingredientName: "플루옥세틴염산염",
    strengths: [20],
    manufacturer: "한국릴리(유)",
    englishName: "Prozac Capsule",
    searchKeywords: ["푸로작", "프로작", "fluoxetine", "플루옥세틴", "플루"],
  }),
  ...catalogItems({
    id: "effexor-xr",
    productName: "이팩사엑스알서방캡슐",
    ingredientName: "벤라팍신염산염",
    strengths: [37.5, 75],
    manufacturer: "비아트리스코리아(주)",
    englishName: "Effexor XR Extended Release Capsule",
    searchKeywords: ["이팩사", "이펙사", "effexor", "venlafaxine", "벤라팍신", "벤라"],
  }),
  ...catalogItems({
    id: "cymbalta",
    productName: "심발타캡슐",
    ingredientName: "둘록세틴염산염",
    strengths: [30, 60],
    manufacturer: "한국릴리(유)",
    englishName: "Cymbalta Delayed Release Capsule",
    searchKeywords: ["심발타", "cymbalta", "duloxetine", "둘록세틴", "둘록"],
  }),
  ...catalogItems({
    id: "rivotril",
    productName: "리보트릴정",
    ingredientName: "클로나제팜",
    strengths: [0.5],
    manufacturer: "(주)종근당",
    englishName: "Rivotril Tablet",
    searchKeywords: ["리보트릴", "rivotril", "clonazepam", "클로나제팜", "클로나"],
  }),
  ...catalogItems({
    id: "xanax",
    productName: "자낙스정",
    ingredientName: "알프라졸람",
    strengths: [0.25, 0.5, 1],
    manufacturer: "비아트리스코리아(주)",
    englishName: "Xanax Tablet",
    searchKeywords: ["자낙스", "xanax", "alprazolam", "알프라졸람", "알프라"],
  }),
  ...catalogItems({
    id: "zanapam",
    productName: "자나팜정",
    ingredientName: "알프라졸람",
    strengths: [0.125, 0.25, 0.4, 0.5, 1],
    manufacturer: "명인제약(주)",
    englishName: "Zanapam Tablet",
    searchKeywords: ["자나팜", "자나", "zanapam", "alprazolam", "알프라졸람", "알프라"],
  }),
  ...catalogItems({
    id: "abilify",
    productName: "아빌리파이정",
    ingredientName: "아리피프라졸",
    strengths: [2, 5, 10, 15],
    manufacturer: "한국오츠카제약(주)",
    englishName: "Abilify Tablet",
    searchKeywords: ["아빌리파이", "아빌리", "aripiprazole", "아리피프라졸", "아리"],
  }),
  ...catalogItems({
    id: "lamictal",
    productName: "라믹탈정",
    ingredientName: "라모트리진",
    strengths: [25, 50, 100],
    manufacturer: "(주)글락소스미스클라인",
    englishName: "Lamictal Tablet",
    searchKeywords: ["라믹탈", "lamictal", "lamotrigine", "라모트리진", "라모"],
  }),
  ...catalogItems({
    id: "seroquel",
    productName: "쎄로켈정",
    ingredientName: "쿠에티아핀푸마르산염",
    strengths: [25, 100, 200],
    manufacturer: "알보젠코리아(주)",
    englishName: "Seroquel Tablet",
    searchKeywords: ["쎄로켈", "세로켈", "seroquel", "quetiapine", "쿠에티아핀", "쿠에"],
  }),
];

export function searchMedications(query: string) {
  const normalized = query.replace(/\s/g, "").toLowerCase();
  if (!normalized) return [];

  const productNameMatches = MOCK_MEDICATIONS.filter((medication) =>
    medication.name.replace(/\s/g, "").toLowerCase().includes(normalized),
  );

  if (productNameMatches.length > 0) return productNameMatches;

  return MOCK_MEDICATIONS.filter((medication) => {
    const searchable = [
      medication.name,
      medicationLabel(medication),
      medication.ingredientName,
      medication.englishName,
      medication.manufacturer,
      ...(medication.searchKeywords ?? []),
    ]
      .filter(Boolean)
      .join("")
      .replace(/\s/g, "")
      .toLowerCase();
    return searchable.includes(normalized);
  });
}

export function enrichManualMedication(name: string, strengthValue: number): MedicationCandidate {
  const normalizedName = name.replace(/\s/g, "").toLowerCase();
  const catalogMatch = MOCK_MEDICATIONS.find(
    (medication) =>
      medication.strengthValue === strengthValue &&
      (medication.name.replace(/\s/g, "").toLowerCase().includes(normalizedName) ||
        normalizedName.includes("콘서타")),
  );

  if (catalogMatch) return catalogMatch;

  return {
    name: name.trim(),
    strengthValue,
    strengthUnit: "mg",
    imagePath: MEDICATION_FALLBACK_IMAGE,
    fallbackImage: MEDICATION_FALLBACK_IMAGE,
    imageType: "fallback",
  };
}
