import { MEDICATION_FALLBACK_IMAGE } from "./medication-utils";
import { getVerifiedCatalogImage } from "./medication-catalog-images";
import { MEDICATION_IMAGE_MAP, LEGACY_MEDICATION_NAME_MAP, type LocalMedicationProductImage } from "./medication-curated-images";

export type ResolvedMedicationImage = {
  type: "product" | "fallback";
  src: string;
};

function normalizeMedicationName(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/밀리그(?:램|람)/g, "mg")
    .replace(/\s+/g, "")
    // Dose parentheses are formatting only; retain dosage forms and unknown annotations.
    .replace(/\((\d+(?:\.\d+)?mg)\)/g, "$1")
    .replace(/\d+(?:\.\d+)?(?=mg)/g, (dose) => String(Number(dose)))
    .trim();
}

export function getLocalMedicationProductImage({
  medicationId,
  medicationName,
}: {
  medicationId?: string;
  medicationName?: string;
}): LocalMedicationProductImage | undefined {
  const normalizedId = medicationId?.trim();
  if (normalizedId) {
    const image = MEDICATION_IMAGE_MAP[normalizedId];
    if (!image || !medicationName?.trim()) return image;
    const namedImage = getLocalMedicationProductImage({ medicationName });
    return namedImage?.catalogId === normalizedId ? image : undefined;
  }

  const normalizedName = normalizeMedicationName(medicationName ?? "");
  const exact = LEGACY_MEDICATION_NAME_MAP[normalizedName];
  if (exact) return exact;

  // Only known manufacturer suffixes for these existing curated products are aliases.
  for (const [name, image] of Object.entries(LEGACY_MEDICATION_NAME_MAP)) {
    const manufacturers = name.startsWith("콘서타")
      ? ["한국얀센", "(주)한국얀센", "한국얀센(주)"]
      : ["명인제약", "명인제약(주)", "(주)명인제약"];
    if (manufacturers.some((manufacturer) => (
      normalizedName === `${name}${manufacturer}`
      || normalizedName === `${name}(${manufacturer})`
    ))) return image;
  }
  return undefined;
}

export function isMedicationFallbackImage(source: string) {
  return source === MEDICATION_FALLBACK_IMAGE
    || /^\/icons\/.*\.svg(?:\?.*)?$/.test(source);
}

export function resolveMedicationImage({
  medicationId,
  medicationName,
  existingImage,
  legacyImage,
  catalogImage,
  fallbackImage,
  failedSources = new Set<string>(),
}: {
  medicationId?: string;
  medicationName?: string;
  existingImage?: string;
  legacyImage?: string;
  catalogImage?: string;
  fallbackImage?: string;
  failedSources?: ReadonlySet<string>;
}): ResolvedMedicationImage {
  const localImage = getLocalMedicationProductImage({ medicationId, medicationName });
  const catalog = getVerifiedCatalogImage(medicationId, medicationName);
  const verifiedCatalogImage = catalog && (!catalogImage || catalogImage === "/api/medications/image/" + catalog.catalogId)
    ? "/api/medications/image/" + catalog.catalogId : undefined;
  const productSources = [existingImage?.trim(), legacyImage?.trim(), localImage?.src, verifiedCatalogImage, fallbackImage?.trim()].filter(
    (source, index, sources): source is string => (
      typeof source === "string"
      && source.length > 0
      && !isMedicationFallbackImage(source)
      && sources.indexOf(source) === index
    ),
  );
  const productSource = productSources.find((source) => !failedSources.has(source));
  if (productSource) return { type: "product", src: productSource };

  return { type: "fallback", src: MEDICATION_FALLBACK_IMAGE };
}
