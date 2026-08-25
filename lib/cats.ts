export const REWARD_CAT_CATALOG = [
  { id: "white", displayName: "하냥이", imagePath: "/cats/white.png" },
  { id: "calico", displayName: "삼색이", imagePath: "/cats/calico.png" },
  { id: "tuxedo", displayName: "턱시도", imagePath: "/cats/tuxedo.png" },
  { id: "rainbow", displayName: "무지개", imagePath: "/cats/rainbow.png" },
  { id: "sunglasses", displayName: "썬구리", imagePath: "/cats/sunglasses.png" },
] as const;

export const REWARD_CAT_IDS = REWARD_CAT_CATALOG.map((cat) => cat.id);
export type RewardCatId = (typeof REWARD_CAT_CATALOG)[number]["id"];
export type CatId = RewardCatId;

// Backwards-compatible catalog name for collection/rendering consumers.
export const CAT_CATALOG = REWARD_CAT_CATALOG;

export const PLACEHOLDER_CAT = {
  id: "unknown",
  displayName: "물음표냥",
  imagePath: "/cats/unknown.png",
} as const;

// Backwards-compatible placeholder name for existing UI consumers.
export const UNKNOWN_CAT = PLACEHOLDER_CAT;

export function isCatId(value: unknown): value is CatId {
  return typeof value === "string" && REWARD_CAT_CATALOG.some((cat) => cat.id === value);
}

export function getCat(catId: CatId) {
  return REWARD_CAT_CATALOG.find((cat) => cat.id === catId) ?? REWARD_CAT_CATALOG[0];
}

function secureRandomValue() {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}

export function selectRandomRewardCatId(
  randomSource: () => number = secureRandomValue,
): RewardCatId {
  const rawValue = randomSource();
  const value = Number.isFinite(rawValue) ? Math.min(Math.max(rawValue, 0), 1) : 0;
  const index = Math.min(
    Math.floor(value * REWARD_CAT_CATALOG.length),
    REWARD_CAT_CATALOG.length - 1,
  );
  return REWARD_CAT_CATALOG[index].id;
}

export function selectRandomCatId(randomValue?: number): CatId {
  return selectRandomRewardCatId(
    randomValue === undefined ? secureRandomValue : () => randomValue,
  );
}
