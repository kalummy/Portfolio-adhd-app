import { CAT_CATALOG, isCatId, UNKNOWN_CAT, type CatId } from "./cats";
import type { MoodRecord } from "./types";

export type CatCollectionItem = {
  catalogId: CatId;
  acquired: boolean;
  displayName: string;
  imagePath: string;
};

export type CatCollectionOrder = "acquired-first" | "locked-first";

export function deriveCatCollection(
  records: ReadonlyArray<Pick<MoodRecord, "catId">>,
  order: CatCollectionOrder = "acquired-first",
): CatCollectionItem[] {
  const acquiredIds = new Set<CatId>();
  records.forEach((record) => {
    if (isCatId(record.catId)) acquiredIds.add(record.catId);
  });

  const items = CAT_CATALOG.map((cat) => {
    const acquired = acquiredIds.has(cat.id);
    return {
      catalogId: cat.id,
      acquired,
      displayName: acquired ? cat.displayName : "???",
      imagePath: acquired ? cat.imagePath : UNKNOWN_CAT.imagePath,
    };
  });

  const acquired = items.filter((item) => item.acquired);
  const locked = items.filter((item) => !item.acquired);

  return order === "acquired-first"
    ? [...acquired, ...locked]
    : [...locked, ...acquired];
}
