import { MEDICATION_FALLBACK_IMAGE } from "./medication-utils";

export type ResolvedMedicationImage = {
  type: "product" | "fallback";
  src: string;
};

type LocalMedicationProductImage = {
  catalogId: string;
  medicationName: string;
  src: string;
  sourceName: string;
  sourceUrl: string;
};

const MFDS_PILL_IMAGE_SOURCE = "식품의약품안전처 의약품 낱알식별정보";

const CONCERTA_18_IMAGE: LocalMedicationProductImage = {
  catalogId: "202005265",
  medicationName: "콘서타OROS서방정 18mg",
  src: "/medications/concerta-18.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1NOwp2F6Iqa",
};

const CONCERTA_27_IMAGE: LocalMedicationProductImage = {
  catalogId: "202005266",
  medicationName: "콘서타OROS서방정 27mg",
  src: "/medications/concerta-27.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Oikd3yeYfA",
};

const CONCERTA_36_IMAGE: LocalMedicationProductImage = {
  catalogId: "201501271",
  medicationName: "콘서타OROS서방정 36mg",
  src: "/medications/concerta-36.png",
  sourceName: "약학정보원 의약품식별정보",
  sourceUrl: "https://www.health.kr/searchDrug/result_take.asp?drug_cd=2015031200004",
};

const CONCERTA_54_IMAGE: LocalMedicationProductImage = {
  catalogId: "201501273",
  medicationName: "콘서타OROS서방정 54mg",
  src: "/medications/concerta-54.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Pm2KqaUvzy",
};

const MEDIKINET_5_IMAGE: LocalMedicationProductImage = {
  catalogId: "201111086",
  medicationName: "메디키넷리타드캡슐 5mg",
  src: "/medications/medikinet-5.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426592401600111",
};

const MEDIKINET_10_IMAGE: LocalMedicationProductImage = {
  catalogId: "201111088",
  medicationName: "메디키넷리타드캡슐 10mg",
  src: "/medications/medikinet-10.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426592401600117",
};

const MEDIKINET_20_IMAGE: LocalMedicationProductImage = {
  catalogId: "201111091",
  medicationName: "메디키넷리타드캡슐 20mg",
  src: "/medications/medikinet-20.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426592401600126",
};

const MEDIKINET_30_IMAGE: LocalMedicationProductImage = {
  catalogId: "201111093",
  medicationName: "메디키넷리타드캡슐 30mg",
  src: "/medications/medikinet-30.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426592401600123",
};

const MEDIKINET_40_IMAGE: LocalMedicationProductImage = {
  catalogId: "201111087",
  medicationName: "메디키넷리타드캡슐 40mg",
  src: "/medications/medikinet-40.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426592401600114",
};

const ATOMOXINE_10_IMAGE: LocalMedicationProductImage = {
  catalogId: "201401189",
  medicationName: "아토목신캡슐 10mg",
  src: "/medications/atomoxine-10.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/154599005608100018",
};

const ATOMOXINE_18_IMAGE: LocalMedicationProductImage = {
  catalogId: "201309921",
  medicationName: "아토목신캡슐 18mg",
  src: "/medications/atomoxine-18.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1Pvn3im1rHy",
};

const ATOMOXINE_25_IMAGE: LocalMedicationProductImage = {
  catalogId: "201309920",
  medicationName: "아토목신캡슐 25mg",
  src: "/medications/atomoxine-25.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426794354400087",
};

const ATOMOXINE_40_IMAGE: LocalMedicationProductImage = {
  catalogId: "201307635",
  medicationName: "아토목신캡슐 40mg",
  src: "/medications/atomoxine-40.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426720602800099",
};

const ATOMOXINE_60_IMAGE: LocalMedicationProductImage = {
  catalogId: "201401190",
  medicationName: "아토목신캡슐 60mg",
  src: "/medications/atomoxine-60.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426847266800014",
};

const ATOMOXINE_80_IMAGE: LocalMedicationProductImage = {
  catalogId: "201404924",
  medicationName: "아토목신캡슐 80mg",
  src: "/medications/atomoxine-80.jpg",
  sourceName: MFDS_PILL_IMAGE_SOURCE,
  sourceUrl: "https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/147426953978800029",
};

const MEDICATION_IMAGE_MAP: Readonly<Record<string, LocalMedicationProductImage>> = {
  "202005265": CONCERTA_18_IMAGE,
  "202005266": CONCERTA_27_IMAGE,
  "201501271": CONCERTA_36_IMAGE,
  "201501273": CONCERTA_54_IMAGE,
  "201111086": MEDIKINET_5_IMAGE,
  "201111088": MEDIKINET_10_IMAGE,
  "201111091": MEDIKINET_20_IMAGE,
  "201111093": MEDIKINET_30_IMAGE,
  "201111087": MEDIKINET_40_IMAGE,
  "201401189": ATOMOXINE_10_IMAGE,
  "201309921": ATOMOXINE_18_IMAGE,
  "201309920": ATOMOXINE_25_IMAGE,
  "201307635": ATOMOXINE_40_IMAGE,
  "201401190": ATOMOXINE_60_IMAGE,
  "201404924": ATOMOXINE_80_IMAGE,
  // Previous local data may still contain this non-current compatibility ID.
  "646902060": CONCERTA_36_IMAGE,
};

const LEGACY_MEDICATION_NAME_MAP: Readonly<Record<string, LocalMedicationProductImage>> = {
  "콘서타oros서방정18mg": CONCERTA_18_IMAGE,
  "콘서타oros서방정27mg": CONCERTA_27_IMAGE,
  "콘서타oros서방정36mg": CONCERTA_36_IMAGE,
  "콘서타oros서방정54mg": CONCERTA_54_IMAGE,
  "메디키넷리타드캡슐5mg": MEDIKINET_5_IMAGE,
  "메디키넷리타드캡슐10mg": MEDIKINET_10_IMAGE,
  "메디키넷리타드캡슐20mg": MEDIKINET_20_IMAGE,
  "메디키넷리타드캡슐30mg": MEDIKINET_30_IMAGE,
  "메디키넷리타드캡슐40mg": MEDIKINET_40_IMAGE,
  "아토목신캡슐10mg": ATOMOXINE_10_IMAGE,
  "아토목신캡슐18mg": ATOMOXINE_18_IMAGE,
  "아토목신캡슐25mg": ATOMOXINE_25_IMAGE,
  "아토목신캡슐40mg": ATOMOXINE_40_IMAGE,
  "아토목신캡슐60mg": ATOMOXINE_60_IMAGE,
  "아토목신캡슐80mg": ATOMOXINE_80_IMAGE,
};

function normalizeMedicationName(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/밀리그(?:램|람)/g, "mg")
    .replace(/\s+/g, "")
    .trim();
}

export function getLocalMedicationProductImage({
  medicationId,
  medicationName,
}: {
  medicationId?: string;
  medicationName?: string;
}) {
  const normalizedId = medicationId?.trim();
  if (normalizedId) return MEDICATION_IMAGE_MAP[normalizedId];

  const normalizedName = normalizeMedicationName(medicationName ?? "");
  return LEGACY_MEDICATION_NAME_MAP[normalizedName];
}

function isFallbackImage(source: string) {
  return source === MEDICATION_FALLBACK_IMAGE
    || /^\/icons\/.*\.svg(?:\?.*)?$/.test(source);
}

export function resolveMedicationImage({
  medicationId,
  medicationName,
  existingImage,
  fallbackImage,
  failedSources = new Set<string>(),
}: {
  medicationId?: string;
  medicationName?: string;
  existingImage?: string;
  fallbackImage?: string;
  failedSources?: ReadonlySet<string>;
}): ResolvedMedicationImage {
  const localImage = getLocalMedicationProductImage({ medicationId, medicationName });
  const productSources = [localImage?.src, existingImage?.trim()].filter(
    (source, index, sources): source is string => (
      typeof source === "string"
      && source.length > 0
      && !isFallbackImage(source)
      && sources.indexOf(source) === index
    ),
  );
  const productSource = productSources.find((source) => !failedSources.has(source));
  if (productSource) return { type: "product", src: productSource };

  const fallbackSources = [fallbackImage?.trim(), MEDICATION_FALLBACK_IMAGE].filter(
    (source, index, sources): source is string => Boolean(source) && sources.indexOf(source) === index,
  );
  const fallbackSource = fallbackSources.find((source) => !failedSources.has(source))
    ?? MEDICATION_FALLBACK_IMAGE;
  return { type: "fallback", src: fallbackSource };
}
