import type { MoodRepository, NewMoodRecord } from "./types";
import { DuplicateMoodRecordError } from "./types";

export type MoodSaveStage =
  | "save_clicked"
  | "repository_ready"
  | "save_resolved"
  | "save_rejected"
  | "reconciliation_started"
  | "reconciliation_found"
  | "navigation_requested";

export type MoodSaveOutcome = "saved" | "reconciled" | "duplicate" | "failed";

export type TimedSettlement<T> =
  | { status: "resolved"; value: T }
  | { status: "rejected"; error: unknown }
  | { status: "pending" };

type SettledSave = Exclude<TimedSettlement<unknown>, { status: "pending" }>;

type MoodSaveTiming = {
  savePendingMs: number;
  lookupTimeoutMs: number;
  lookupAttempts: number;
  lookupRetryMs: number;
};

type SaveMoodWithReconciliationOptions = {
  repository: Pick<MoodRepository, "save" | "findByDate">;
  record: NewMoodRecord;
  date: string;
  onStage: (stage: MoodSaveStage) => void;
  onLateOutcome?: (outcome: Exclude<MoodSaveOutcome, "failed">) => void;
  timing?: Partial<MoodSaveTiming>;
};

export type MoodSaveResult = {
  outcome: MoodSaveOutcome;
  error?: unknown;
};

const DEFAULT_TIMING: MoodSaveTiming = {
  savePendingMs: 6_000,
  lookupTimeoutMs: 2_000,
  lookupAttempts: 2,
  lookupRetryMs: 300,
};

function delay(durationMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, durationMs));
}

export function settleWithin<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<TimedSettlement<T>> {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (settlement: TimedSettlement<T>) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(settlement);
    };
    const timer = setTimeout(() => finish({ status: "pending" }), timeoutMs);
    void promise.then(
      (value) => finish({ status: "resolved", value }),
      (error: unknown) => finish({ status: "rejected", error }),
    );
  });
}

export async function saveMoodWithReconciliation({
  repository,
  record,
  date,
  onStage,
  onLateOutcome,
  timing: timingOverride,
}: SaveMoodWithReconciliationOptions): Promise<MoodSaveResult> {
  const timing = { ...DEFAULT_TIMING, ...timingOverride };
  let latestSaveSettlement: SettledSave | null = null;
  let returned = false;
  let saveSettlementReported = false;
  let reconciliationReported = false;
  let lateOutcomeHandled = false;
  const readLatestSaveSettlement = () => latestSaveSettlement;

  const reportSaveSettlement = (settlement: SettledSave) => {
    if (saveSettlementReported) return;
    saveSettlementReported = true;
    onStage(settlement.status === "resolved" ? "save_resolved" : "save_rejected");
  };

  const reportReconciliationStarted = () => {
    if (reconciliationReported) return;
    reconciliationReported = true;
    onStage("reconciliation_started");
  };

  const findExistingRecord = async () => {
    const lookup = await settleWithin(
      Promise.resolve().then(() => repository.findByDate(date)),
      timing.lookupTimeoutMs,
    );
    return lookup.status === "resolved" && lookup.value !== null;
  };

  const reconcileLateRejection = async (settlement: SettledSave) => {
    if (lateOutcomeHandled || settlement.status !== "rejected") return;
    reportSaveSettlement(settlement);
    if (settlement.error instanceof DuplicateMoodRecordError) {
      lateOutcomeHandled = true;
      onLateOutcome?.("duplicate");
      return;
    }

    reportReconciliationStarted();
    if (await findExistingRecord()) {
      onStage("reconciliation_found");
      lateOutcomeHandled = true;
      onLateOutcome?.("reconciled");
    }
  };

  const saveSettlement = Promise.resolve()
    .then(() => repository.save(record))
    .then<SettledSave, SettledSave>(
      () => ({ status: "resolved", value: undefined }),
      (error: unknown) => ({ status: "rejected", error }),
    )
    .then((settlement) => {
      latestSaveSettlement = settlement;
      if (!returned || lateOutcomeHandled) return settlement;
      if (settlement.status === "resolved") {
        reportSaveSettlement(settlement);
        lateOutcomeHandled = true;
        onLateOutcome?.("saved");
      } else {
        void reconcileLateRejection(settlement);
      }
      return settlement;
    });

  const initialSave = await settleWithin(saveSettlement, timing.savePendingMs);
  if (initialSave.status === "resolved") {
    reportSaveSettlement(initialSave.value);
    if (initialSave.value.status === "resolved") return { outcome: "saved" };
    if (initialSave.value.error instanceof DuplicateMoodRecordError) {
      return { outcome: "duplicate", error: initialSave.value.error };
    }
  }

  const initialError = initialSave.status === "resolved"
    && initialSave.value.status === "rejected"
    ? initialSave.value.error
    : undefined;

  reportReconciliationStarted();
  for (let attempt = 0; attempt < timing.lookupAttempts; attempt += 1) {
    const beforeLookup = readLatestSaveSettlement();
    if (beforeLookup?.status === "resolved") {
      reportSaveSettlement(beforeLookup);
      return { outcome: "saved" };
    }
    if (
      beforeLookup?.status === "rejected"
      && beforeLookup.error instanceof DuplicateMoodRecordError
    ) {
      reportSaveSettlement(beforeLookup);
      return { outcome: "duplicate", error: beforeLookup.error };
    }

    if (await findExistingRecord()) {
      onStage("reconciliation_found");
      return { outcome: "reconciled" };
    }

    const afterLookup = readLatestSaveSettlement();
    if (afterLookup?.status === "resolved") {
      reportSaveSettlement(afterLookup);
      return { outcome: "saved" };
    }
    if (
      afterLookup?.status === "rejected"
      && afterLookup.error instanceof DuplicateMoodRecordError
    ) {
      reportSaveSettlement(afterLookup);
      return { outcome: "duplicate", error: afterLookup.error };
    }

    if (attempt + 1 < timing.lookupAttempts) await delay(timing.lookupRetryMs);
  }

  const finalSaveSettlement = readLatestSaveSettlement();
  if (finalSaveSettlement?.status === "rejected") {
    reportSaveSettlement(finalSaveSettlement);
  }
  returned = true;
  return {
    outcome: "failed",
    error: finalSaveSettlement?.status === "rejected"
      ? finalSaveSettlement.error
      : initialError,
  };
}
