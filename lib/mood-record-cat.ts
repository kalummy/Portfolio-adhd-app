import { getCat, isCatId, type CatId } from "./cats";

export const LEGACY_MOOD_RECORD_FALLBACK_CAT_ID: CatId = "white";

export function getMoodRecordDisplayCat(catId: unknown) {
  return getCat(isCatId(catId) ? catId : LEGACY_MOOD_RECORD_FALLBACK_CAT_ID);
}
