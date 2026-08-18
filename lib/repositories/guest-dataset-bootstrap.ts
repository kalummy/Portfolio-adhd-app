export type GuestDatasetReservation = {
  datasetId: string;
};

export type GuestDatasetMergeResponse = {
  success: boolean;
  claimed: boolean;
  failureReason?: string;
};

export type GuestDatasetBootstrapResult =
  | { status: "no-local-data" }
  | { status: "merged" }
  | { status: "failed"; failureReason: string };

type GuestDatasetBootstrapDependencies<Reservation extends GuestDatasetReservation> = {
  userId: string;
  reserve(userId: string): Promise<Reservation | null>;
  merge(reservation: Reservation): Promise<GuestDatasetMergeResponse>;
  complete(datasetId: string, userId: string): Promise<void>;
  release(datasetId: string, userId: string): Promise<void>;
};

async function releaseReservation(
  datasetId: string,
  userId: string,
  release: (datasetId: string, userId: string) => Promise<void>,
) {
  try {
    await release(datasetId, userId);
  } catch {
    // Keep the original merge failure. The local dataset remains retryable.
  }
}

export async function bootstrapGuestDataset<Reservation extends GuestDatasetReservation>({
  userId,
  reserve,
  merge,
  complete,
  release,
}: GuestDatasetBootstrapDependencies<Reservation>): Promise<GuestDatasetBootstrapResult> {
  let reservation: Reservation | null;
  try {
    reservation = await reserve(userId);
  } catch (error) {
    return {
      status: "failed",
      failureReason: error instanceof Error ? error.message : "guest_dataset_reservation_failed",
    };
  }
  if (!reservation) return { status: "no-local-data" };

  try {
    const result = await merge(reservation);
    if (result.success && result.claimed) {
      await complete(reservation.datasetId, userId);
      return { status: "merged" };
    }

    await releaseReservation(reservation.datasetId, userId, release);
    return {
      status: "failed",
      failureReason: result.failureReason ?? "guest_dataset_merge_failed",
    };
  } catch (error) {
    await releaseReservation(reservation.datasetId, userId, release);
    return {
      status: "failed",
      failureReason: error instanceof Error ? error.message : "guest_dataset_merge_failed",
    };
  }
}
