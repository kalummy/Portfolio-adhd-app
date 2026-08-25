export const CAT_CATALOG = [
  { id: "white", displayName: "하냥이", imagePath: "/cats/white.png" },
  { id: "calico", displayName: "삼색이", imagePath: "/cats/calico.png" },
  { id: "tuxedo", displayName: "턱시도", imagePath: "/cats/tuxedo.png" },
  { id: "rainbow", displayName: "무지개", imagePath: "/cats/rainbow.png" },
  { id: "sunglasses", displayName: "썬구리", imagePath: "/cats/sunglasses.png" },
] as const;

export type CatId = (typeof CAT_CATALOG)[number]["id"];

export const UNKNOWN_CAT = {
  displayName: "물음표냥",
  imagePath: "/cats/unknown.png",
} as const;

export function isCatId(value: unknown): value is CatId {
  return typeof value === "string" && CAT_CATALOG.some((cat) => cat.id === value);
}

export function getCat(catId: CatId) {
  return CAT_CATALOG.find((cat) => cat.id === catId) ?? CAT_CATALOG[0];
}

export function selectRandomCatId(randomValue?: number): CatId {
  const value = randomValue ?? crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
  const index = Math.min(Math.floor(value * CAT_CATALOG.length), CAT_CATALOG.length - 1);
  return CAT_CATALOG[index].id;
}
