import { MEDICATION_FALLBACK_IMAGE } from "./medication-utils";
import { selectOfficialManualMedicationCandidate } from "./medication-candidates";
import { getLocalMedicationProductImage } from "./medication-images";
import type { MedicationCandidate } from "./types";

const PRODUCT_ENDPOINT =
  "https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnInq07";
const PRODUCT_DETAIL_ENDPOINT =
  "https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnDtlInq06";
const PILL_ENDPOINT =
  "https://apis.data.go.kr/1471000/MdcinGrnIdntfcInfoService03/getMdcinGrnIdntfcInfoList03";

const OFFICIAL_IMAGE_KEYS = [
  "ITEM_IMAGE",
  "item_image",
  "itemImage",
  "PRODUCT_IMAGE",
  "product_image",
  "productImage",
] as const;

type ApiItem = Record<string, unknown>;

export type MfdsImageSource = "product" | "pill";

export type MfdsImageCandidate = {
  source: MfdsImageSource;
  originalUrl: string;
};

export type VerifiedMfdsImage = MfdsImageCandidate & {
  bytes: Uint8Array;
  contentType: string;
  finalUrl: string;
  status: number;
};

function getString(item: ApiItem, ...keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function getApiItems(payload: unknown): ApiItem[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const response = root.response && typeof root.response === "object"
    ? root.response as Record<string, unknown>
    : root;
  const body = response.body && typeof response.body === "object"
    ? response.body as Record<string, unknown>
    : undefined;
  if (!body) return [];

  const items = body.items;
  if (Array.isArray(items)) return items.filter(isApiItem);
  if (items && typeof items === "object") {
    const nestedItem = (items as Record<string, unknown>).item;
    if (Array.isArray(nestedItem)) return nestedItem.filter(isApiItem);
    if (isApiItem(nestedItem)) return [nestedItem];
  }
  return [];
}

function isApiItem(value: unknown): value is ApiItem {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function encodedServiceKey(serviceKey: string) {
  return /%[0-9a-f]{2}/i.test(serviceKey) ? serviceKey : encodeURIComponent(serviceKey);
}

function getDrugPermissionServiceKey() {
  const serviceKey = process.env.MFDS_SERVICE_KEY?.trim();
  if (!serviceKey) throw new Error("식약처 제품 허가정보 API 인증키가 설정되지 않았어요.");
  return serviceKey;
}

function getPillIdentificationServiceKey() {
  const serviceKey = process.env.MFDS_PILL_IDENTIFICATION_SERVICE_KEY?.trim();
  if (!serviceKey) throw new Error("식약처 낱알식별 API 인증키가 설정되지 않았어요.");
  return serviceKey;
}

async function fetchItems(
  endpoint: string,
  serviceKey: string,
  searchParameter: string,
  query: string,
) {
  const parameters = new URLSearchParams({
    pageNo: "1",
    numOfRows: "20",
    type: "json",
    [searchParameter]: query,
  });
  const requestUrl = `${endpoint}?serviceKey=${encodedServiceKey(serviceKey)}&${parameters.toString()}`;
  const response = await fetch(requestUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) throw new Error("식약처 의약품 정보를 불러오지 못했어요.");
  const responseText = await response.text();
  try {
    const payload: unknown = JSON.parse(responseText);
    return getApiItems(payload);
  } catch {
    return parseXmlItems(responseText);
  }
}

function fetchPillItems(searchParameter: string, query: string) {
  return fetchItems(
    PILL_ENDPOINT,
    getPillIdentificationServiceKey(),
    searchParameter,
    query,
  );
}

function decodeXmlValue(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseXmlItems(xml: string): ApiItem[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((itemMatch) => {
    const item: ApiItem = {};
    for (const fieldMatch of itemMatch[1].matchAll(/<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g)) {
      item[fieldMatch[1]] = decodeXmlValue(fieldMatch[2].trim());
    }
    return item;
  });
}

function parseStrength(item: ApiItem) {
  const sources = [
    getString(item, "ITEM_NAME", "item_name"),
    getString(item, "ITEM_ENG_NAME", "item_eng_name", "itemEngName"),
  ];

  for (const source of sources) {
    const match = source.match(/(\d+(?:[.,]\d+)?)\s*(?:mg|㎎|밀리그(?:램|람))/i);
    if (match) return Number(match[1].replace(",", "."));
  }
  return 0;
}

function cleanProductLabel(productName: string) {
  return productName
    .replace(/\s*\([^)]*\).*$/, "")
    .replace(/(\d+(?:[.,]\d+)?)\s*밀리그(?:램|람)/gi, "$1mg")
    .replace(/([^\s])(\d+(?:\.\d+)?mg)\b/i, "$1 $2")
    .trim();
}

function productBaseName(label: string) {
  return label.replace(/\s*\d+(?:\.\d+)?mg\b.*$/i, "").trim() || label;
}

export function normalizeOfficialImage(value: string) {
  if (!value) return undefined;

  let normalizedValue = decodeXmlValue(value.trim());
  if (!/^https?:\/\//i.test(normalizedValue)) {
    try {
      const decodedValue = decodeURIComponent(normalizedValue);
      if (/^https?:\/\//i.test(decodedValue)) normalizedValue = decodedValue;
    } catch {
      return undefined;
    }
  }

  try {
    const url = new URL(normalizedValue);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    if (hostname !== "mfds.go.kr" && !hostname.endsWith(".mfds.go.kr")) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function officialImageFromItem(item: ApiItem) {
  return normalizeOfficialImage(getString(item, ...OFFICIAL_IMAGE_KEYS));
}

function cleanIngredientName(value: string) {
  const seen = new Set<string>();
  return value
    .split(/[|/]/)
    .map((ingredient) => ingredient.replace(/\[[^\]]+\]/g, "").trim())
    .filter((ingredient) => {
      if (!ingredient || seen.has(ingredient)) return false;
      seen.add(ingredient);
      return true;
    })
    .join("/");
}

function toMedicationCandidate(
  item: ApiItem,
  image?: MfdsImageCandidate,
): MedicationCandidate | null {
  const catalogId = getString(
    item,
    "ITEM_SEQ",
    "item_seq",
    "itemSeq",
    "PRDLST_STDR_CODE",
    "prdlst_Stdr_code",
  );
  const rawProductName = getString(item, "ITEM_NAME", "item_name", "itemName");
  if (!catalogId || !rawProductName) return null;

  const displayLabel = cleanProductLabel(rawProductName);
  const officialImage = normalizeOfficialImage(image?.originalUrl ?? "");
  const verifiedLocalImage = getLocalMedicationProductImage({ medicationId: catalogId });
  const productImage = verifiedLocalImage?.src
    ?? (officialImage ? `/api/medications/image/${catalogId}` : undefined);

  return {
    catalogId,
    displayLabel,
    name: productBaseName(displayLabel),
    ingredientName: cleanIngredientName(getString(
      item,
      "ITEM_INGR_NAME",
      "item_ingr_name",
      "MAIN_ITEM_INGR",
      "main_item_ingr",
      "MATERIAL_NAME",
      "material_name",
    )),
    strengthValue: parseStrength(item),
    strengthUnit: "mg",
    manufacturer: getString(item, "ENTP_NAME", "entp_name", "entpName"),
    englishName: getString(item, "ITEM_ENG_NAME", "item_eng_name", "itemEngName"),
    imagePath: productImage ?? MEDICATION_FALLBACK_IMAGE,
    productImage,
    fallbackImage: MEDICATION_FALLBACK_IMAGE,
    imageType: productImage ? "product" : "fallback",
    imageSourceName: verifiedLocalImage?.sourceName ?? (officialImage
      ? image?.source === "product"
        ? "식품의약품안전처 의약품 제품 허가정보"
        : "식품의약품안전처 의약품 낱알식별정보"
      : undefined),
    imageSourceUrl: verifiedLocalImage?.sourceUrl ?? officialImage,
    officialMatchStatus: "matched",
  };
}

export async function searchMfdsMedications(query: string): Promise<MedicationCandidate[]> {
  const serviceKey = getDrugPermissionServiceKey();

  const productMatches = await fetchItems(PRODUCT_ENDPOINT, serviceKey, "item_name", query);
  const permitItems = productMatches.length > 0
    ? productMatches
    : await fetchItems(PRODUCT_ENDPOINT, serviceKey, "item_ingr_name", query);

  const seen = new Set<string>();
  const medications = permitItems
    .map((item) => toMedicationCandidate(item))
    .filter((medication): medication is MedicationCandidate => {
      if (!medication?.catalogId || seen.has(medication.catalogId)) return false;
      seen.add(medication.catalogId);
      return true;
    })
    .slice(0, 20);

  const normalizedQuery = query.replace(/\s/g, "").toLowerCase();
  return medications.sort((left, right) => {
    const leftName = left.name.replace(/\s/g, "").toLowerCase();
    const rightName = right.name.replace(/\s/g, "").toLowerCase();
    const leftStartsWith = leftName.startsWith(normalizedQuery);
    const rightStartsWith = rightName.startsWith(normalizedQuery);
    if (leftStartsWith !== rightStartsWith) return leftStartsWith ? -1 : 1;
    const nameOrder = leftName.localeCompare(rightName, "ko");
    if (nameOrder !== 0) return nameOrder;
    if (left.strengthValue === right.strengthValue) return 0;
    if (left.strengthValue === 0) return 1;
    if (right.strengthValue === 0) return -1;
    return left.strengthValue - right.strengthValue;
  });
}

export async function getMfdsMedication(itemSequence: string): Promise<MedicationCandidate | null> {
  const serviceKey = getDrugPermissionServiceKey();

  const [detailItems, pillItems] = await Promise.all([
    fetchItems(PRODUCT_DETAIL_ENDPOINT, serviceKey, "item_seq", itemSequence),
    fetchPillItems("item_seq", itemSequence).catch(() => []),
  ]);
  const detail = detailItems[0];
  if (!detail) return null;
  const productImage = officialImageFromItem(detail);
  const pillImage = pillItems[0] ? officialImageFromItem(pillItems[0]) : undefined;
  const image = pillImage
    ? { source: "pill" as const, originalUrl: pillImage }
    : productImage
      ? { source: "product" as const, originalUrl: productImage }
      : undefined;
  return toMedicationCandidate(detail, image);
}

export type ManualMedicationMatchResult =
  | { status: "matched"; medication: MedicationCandidate }
  | { status: "not-found" }
  | { status: "ambiguous" };

export async function matchMfdsManualMedication(
  name: string,
  strengthValue: number,
): Promise<ManualMedicationMatchResult> {
  const candidates = await searchMfdsMedications(name);
  const selection = selectOfficialManualMedicationCandidate(name, strengthValue, candidates);
  if (selection.status !== "matched") return selection;

  const catalogId = selection.medication.catalogId;
  if (!catalogId) return { status: "not-found" };
  const medication = await getMfdsMedication(catalogId);
  return medication
    ? { status: "matched", medication }
    : { status: "not-found" };
}

export async function getMfdsImageCandidates(
  itemSequence: string,
): Promise<MfdsImageCandidate[]> {
  const serviceKey = getDrugPermissionServiceKey();

  const [detailItems, pillItems] = await Promise.all([
    fetchItems(PRODUCT_DETAIL_ENDPOINT, serviceKey, "item_seq", itemSequence),
    fetchPillItems("item_seq", itemSequence),
  ]);

  const candidates: MfdsImageCandidate[] = [];
  const productImage = detailItems[0] ? officialImageFromItem(detailItems[0]) : undefined;
  const pillImage = pillItems[0] ? officialImageFromItem(pillItems[0]) : undefined;

  if (pillImage) candidates.push({ source: "pill", originalUrl: pillImage });
  if (productImage && productImage !== pillImage) {
    candidates.push({ source: "product", originalUrl: productImage });
  }
  return candidates;
}

function isValidImageBody(bytes: Uint8Array, contentType: string) {
  if (bytes.byteLength < 12 || !contentType.toLowerCase().startsWith("image/")) return false;

  const matches = (...signature: number[]) =>
    signature.every((value, index) => bytes[index] === value);
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));

  return (
    matches(0xff, 0xd8, 0xff) ||
    matches(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) ||
    ascii(0, 6) === "GIF87a" ||
    ascii(0, 6) === "GIF89a" ||
    (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") ||
    matches(0x42, 0x4d)
  );
}

function upstreamUrls(originalUrl: string) {
  const parsed = new URL(originalUrl);
  if (parsed.protocol !== "http:") return [parsed.toString()];

  const secureUrl = new URL(parsed);
  secureUrl.protocol = "https:";
  return [secureUrl.toString(), parsed.toString()];
}

export async function fetchVerifiedMfdsImage(
  candidate: MfdsImageCandidate,
): Promise<VerifiedMfdsImage | null> {
  const officialUrl = normalizeOfficialImage(candidate.originalUrl);
  if (!officialUrl) return null;

  for (const upstreamUrl of upstreamUrls(officialUrl)) {
    try {
      const response = await fetch(upstreamUrl, {
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/*" },
      });
      const finalUrl = normalizeOfficialImage(response.url);
      const contentType = response.headers.get("content-type")?.split(";")[0].trim() ?? "";
      if (!response.ok || response.status !== 200 || !finalUrl) continue;

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!isValidImageBody(bytes, contentType)) continue;

      return {
        ...candidate,
        bytes,
        contentType,
        finalUrl,
        status: response.status,
      };
    } catch {
      // HTTP 원본도 있는 경우 다음 후보를 확인해요.
    }
  }
  return null;
}
