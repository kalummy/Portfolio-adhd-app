import type { SupabaseClient } from "@supabase/supabase-js";
import { getVerifiedCatalogImage, normalizedCatalogLabel } from "./medication-catalog-images";
import {
  fetchVerifiedMfdsImage,
  getMfdsImageCandidates,
  normalizeOfficialImage,
  type MfdsImageCandidate,
} from "./mfds-medications";

type StoredImageMetadata = {
  catalog_id: string | null;
  display_label: string | null;
  name: string;
  strength_value: number;
  strength_unit: string;
  manufacturer: string | null;
  official_match_status: string | null;
  image_source_name: string | null;
  image_source_url: string | null;
};

const normalizeLabel = normalizedCatalogLabel;

function hasVerifiedProductIdentity(row: StoredImageMetadata, itemSequence: string) {
  return (
    row.catalog_id === itemSequence && row.official_match_status === "matched"
    && row.manufacturer?.trim() && row.strength_unit === "mg"
    && Number.isFinite(row.strength_value) && row.strength_value > 0
    && /(?:정|캡슐)$/.test(row.name.trim())
    && normalizeLabel(row.display_label ?? "") === normalizeLabel(`${row.name} ${row.strength_value}mg`)
  );
}

export function storedMfdsImageCandidates(itemSequence: string, rows: StoredImageMetadata[]): MfdsImageCandidate[] {
  const matches = rows.filter((row) => hasVerifiedProductIdentity(row, itemSequence));
  // Conflicting product/dose/form metadata for one catalog ID cannot establish identity.
  if (new Set(rows.map((row) => normalizeLabel(`${row.name} ${row.strength_value}mg`))).size > 1) return [];
  const candidates: MfdsImageCandidate[] = [];
  for (const row of matches) {
    const verifiedCatalog = getVerifiedCatalogImage(itemSequence, row.display_label ?? "");
    const originalUrl = normalizeOfficialImage(row.image_source_url ?? "");
    if (!verifiedCatalog || originalUrl !== verifiedCatalog.sourceUrl
      || !row.image_source_name?.startsWith("식품의약품안전처")) continue;
    const url = new URL(originalUrl);
    // A source attribution page is not an image. Use only the existing official image endpoint.
    if (url.hostname !== "nedrug.mfds.go.kr"
      || !/^\/pbp\/cmn\/itemImageDownload\/[^/]+$/.test(url.pathname)) continue;
    const source = row.image_source_name.includes("낱알식별") ? "pill" : "product";
    if (!candidates.some((candidate) => candidate.originalUrl === originalUrl)) {
      candidates.push({ source, originalUrl });
    }
  }
  return candidates;
}

export async function getVerifiedMedicationImage(
  itemSequence: string,
  client: SupabaseClient,
  userId: string,
) {
  const { data, error } = await client.from("user_medications")
    .select("catalog_id,display_label,name,strength_value,strength_unit,manufacturer,official_match_status,image_source_name,image_source_url")
    .eq("user_id", userId).eq("catalog_id", itemSequence)
    .order("updated_at", { ascending: false }).limit(50);
  if (error) throw new Error("medication_image_metadata_unavailable");
  if (data?.length && (data.some((row: StoredImageMetadata) => !hasVerifiedProductIdentity(row, itemSequence))
    || new Set(data.map((row: StoredImageMetadata) => normalizeLabel(row.name + " " + row.strength_value + "mg"))).size > 1)) return null;
  const verifiedCatalog = getVerifiedCatalogImage(itemSequence);
  if (verifiedCatalog && data?.some((row: StoredImageMetadata) => normalizeLabel(row.display_label ?? "") !== normalizeLabel(verifiedCatalog.displayLabel))) return null;
  const tried = new Set<string>();
  for (const candidate of storedMfdsImageCandidates(itemSequence, data ?? [])) {
    tried.add(candidate.originalUrl);
    const image = await fetchVerifiedMfdsImage(candidate);
    if (image) return image;
  }
  if (verifiedCatalog && !tried.has(verifiedCatalog.sourceUrl)) {
    tried.add(verifiedCatalog.sourceUrl);
    const image = await fetchVerifiedMfdsImage({source:"pill",originalUrl:verifiedCatalog.sourceUrl});
    if (image) return image;
  }
  // Only re-query the catalog when no valid saved image can be served.
  // Missing keys for one metadata service must not discard the other service's result.
  for (const candidate of await getMfdsImageCandidates(itemSequence, data?.[0] ? {
    name: data[0].name, strengthValue: data[0].strength_value,
  } : undefined)) {
    if (tried.has(candidate.originalUrl)) continue;
    const image = await fetchVerifiedMfdsImage(candidate);
    if (image) return image;
  }
  return null;
}
