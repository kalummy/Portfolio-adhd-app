// Existing ADDI Production metadata only; verified against the official catalog on 2026-10-05.
// No new image files or third-party image collection. Product, dose, form, ID and source URL agree.
export type VerifiedCatalogImage = {
  catalogId: string; name: string; strengthValue: number; strengthUnit: string;
  displayLabel: string; sourceUrl: string;
};
const entries: VerifiedCatalogImage[] = [
  {
    "catalogId": "198700736",
    "name": "환인벤즈트로핀정",
    "strengthValue": 1,
    "strengthUnit": "mg",
    "displayLabel": "환인벤즈트로핀정 1mg",
    "sourceUrl": "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1P2JYwFsCIO"
  },
  {
    "catalogId": "198702209",
    "name": "자나팜정",
    "strengthValue": 0.25,
    "strengthUnit": "mg",
    "displayLabel": "자나팜정 0.25mg",
    "sourceUrl": "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1OiAjxwzC-Y"
  },
  {
    "catalogId": "200409982",
    "name": "아보다트연질캡슐",
    "strengthValue": 0.5,
    "strengthUnit": "mg",
    "displayLabel": "아보다트연질캡슐 0.5mg",
    "sourceUrl": "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Oi0vWfEyP7"
  },
  {
    "catalogId": "200808451",
    "name": "아빌리파이정",
    "strengthValue": 2,
    "strengthUnit": "mg",
    "displayLabel": "아빌리파이정 2mg",
    "sourceUrl": "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/151706776344800032"
  },
  {
    "catalogId": "201111087",
    "name": "메디키넷리타드캡슐",
    "strengthValue": 40,
    "strengthUnit": "mg",
    "displayLabel": "메디키넷리타드캡슐 40mg",
    "sourceUrl": "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426592401600114"
  },
  {
    "catalogId": "201111088",
    "name": "메디키넷리타드캡슐",
    "strengthValue": 10,
    "strengthUnit": "mg",
    "displayLabel": "메디키넷리타드캡슐 10mg",
    "sourceUrl": "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426592401600117"
  },
  {
    "catalogId": "201307635",
    "name": "아토목신캡슐",
    "strengthValue": 40,
    "strengthUnit": "mg",
    "displayLabel": "아토목신캡슐 40mg",
    "sourceUrl": "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426720602800099"
  },
  {
    "catalogId": "201907454",
    "name": "에소메딘정",
    "strengthValue": 40,
    "strengthUnit": "mg",
    "displayLabel": "에소메딘정 40mg",
    "sourceUrl": "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1M-s0nmguuD"
  },
  {
    "catalogId": "202002454",
    "name": "데팍신서방정",
    "strengthValue": 100,
    "strengthUnit": "mg",
    "displayLabel": "데팍신서방정 100mg",
    "sourceUrl": "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1N925qYaIFI"
  }
];
export const VERIFIED_CATALOG_IMAGES: Readonly<Record<string, VerifiedCatalogImage>> = Object.fromEntries(entries.map(entry => [entry.catalogId, entry]));
export function normalizedCatalogLabel(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/밀리그(?:램|람)/g, "mg")
    .replace(/\s+/g, "").replace(/\((\d+(?:\.\d+)?mg)\)/g, "$1")
    .replace(/\d+(?:\.\d+)?(?=mg)/g, dose => String(Number(dose)));
}
export function getVerifiedCatalogImage(catalogId: string | undefined, label?: string) {
  const image = VERIFIED_CATALOG_IMAGES[catalogId?.trim() ?? ""];
  return image && (!label || normalizedCatalogLabel(label) === normalizedCatalogLabel(image.displayLabel)) ? image : undefined;
}
