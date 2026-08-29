import type { User } from "@supabase/supabase-js";

export const ADDI_PROFILE_METADATA_KEY = "addi_profile";

export const ADDI_PROFILE_IDS = ["calico", "hedgehog", "duck", "rabbit"] as const;

export type AddiProfileId = (typeof ADDI_PROFILE_IDS)[number];

export const DEFAULT_ADDI_PROFILE_ID: AddiProfileId = "calico";

export const ADDI_PROFILES: ReadonlyArray<{
  id: AddiProfileId;
  label: string;
  asset: string;
}> = [
  { id: "calico", label: "삼색이", asset: "/profile/profile-calico.svg" },
  { id: "hedgehog", label: "고슴도치", asset: "/profile/profile-hedgehog.svg" },
  { id: "duck", label: "오리", asset: "/profile/profile-duck.svg" },
  { id: "rabbit", label: "토끼", asset: "/profile/profile-rabbit.svg" },
];

export function isAddiProfileId(value: unknown): value is AddiProfileId {
  return typeof value === "string" && ADDI_PROFILE_IDS.includes(value as AddiProfileId);
}
export function getAddiProfileId(user: User | null | undefined): AddiProfileId {
  const value = user?.user_metadata?.[ADDI_PROFILE_METADATA_KEY];
  return isAddiProfileId(value) ? value : DEFAULT_ADDI_PROFILE_ID;
}

export function getAddiProfileAsset(profileId: AddiProfileId) {
  return ADDI_PROFILES.find((profile) => profile.id === profileId)?.asset
    ?? ADDI_PROFILES[0].asset;
}
