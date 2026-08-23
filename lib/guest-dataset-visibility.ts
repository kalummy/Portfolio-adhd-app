export type VisibleGuestDatasetClaim = {
  medicationIds: string[];
  intakeRecordIds: string[];
  moodRecordIds: string[];
  claimedUserId: string;
  claimedAt: string;
};

type GuestRecordIdField = "medicationIds" | "intakeRecordIds" | "moodRecordIds";

function visibleClaims(
  claims: VisibleGuestDatasetClaim[],
  visibleClaimedUserId: string | undefined,
) {
  if (!visibleClaimedUserId) return [];
  return claims.filter((claim) => claim.claimedUserId === visibleClaimedUserId);
}

export function getVisibleGuestRecordIds(
  activeIds: string[],
  claims: VisibleGuestDatasetClaim[],
  visibleClaimedUserId: string | undefined,
  field: GuestRecordIdField,
) {
  return [...new Set([
    ...activeIds,
    ...visibleClaims(claims, visibleClaimedUserId).flatMap((claim) => claim[field]),
  ])];
}
