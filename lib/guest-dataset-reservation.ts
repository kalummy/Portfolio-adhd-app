export const GUEST_DATASET_RESERVATION_TTL_MS = 10 * 60 * 1000;

type GuestDatasetReservationState = {
  reservedByUserId?: string;
  reservedAt?: string;
};

export type GuestDatasetReservationDecision =
  | "available"
  | "same-user"
  | "stale"
  | "locked";

export function getGuestDatasetReservationDecision(
  state: GuestDatasetReservationState,
  userId: string,
  now = Date.now(),
): GuestDatasetReservationDecision {
  if (!state.reservedByUserId) return "available";
  if (state.reservedByUserId === userId) return "same-user";

  const reservedAt = state.reservedAt ? Date.parse(state.reservedAt) : Number.NaN;
  if (!Number.isFinite(reservedAt)) return "stale";
  return now - reservedAt >= GUEST_DATASET_RESERVATION_TTL_MS ? "stale" : "locked";
}
