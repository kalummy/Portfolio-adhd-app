import type {
  PushNotificationPayload,
  PushSubscriptionInput,
} from "@/lib/push/contracts";
import {
  getReminderContent,
  getReminderNotificationId,
  type ReminderDeliveryKind,
  type ReminderSlotKey,
  type ReminderWindow,
} from "./policy";

export type ReminderClaim = {
  userId: string;
  localDate: string;
  slotKey: ReminderSlotKey;
  claimToken: string;
  attemptCount: number;
};

export type ReminderSubscription = PushSubscriptionInput & {
  id: string;
  userId: string;
};

export type PreparedReminder = {
  deliveryKind: ReminderDeliveryKind;
  attemptCount: number;
  subscriptions: ReminderSubscription[];
};

export type ReminderFinalization = {
  outcome: "sent" | "retryable_failed" | "permanent_failed" | "cancelled";
  deliveryKind: ReminderDeliveryKind;
  httpStatus: number | null;
  errorCode:
    | null
    | "provider_429"
    | "provider_5xx"
    | "provider_4xx"
    | "all_endpoints_revoked"
    | "provider_outcome_unknown"
    | "window_expired_during_send"
    | "window_expired_before_send";
  revokedSubscriptionIds: string[];
  now: string;
};

export interface ReminderDispatchRepository {
  claimDue(window: ReminderWindow, now: string): Promise<ReminderClaim[]>;
  prepare(claim: ReminderClaim, now: string): Promise<PreparedReminder | null>;
  finalize(claim: ReminderClaim, finalization: ReminderFinalization): Promise<void>;
}

export type SendReminderPush = (
  subscription: PushSubscriptionInput,
  payload: PushNotificationPayload,
) => Promise<unknown>;

export type ReminderRunResult = {
  claimed: number;
  sent: number;
  retryableFailed: number;
  permanentFailed: number;
  cancelled: number;
};

const REMINDER_CLAIM_CONCURRENCY = 4;
const REMINDER_OUTBOUND_CONCURRENCY = 4;

class ReminderWindowExpiredBeforeProviderError extends Error {
  constructor() {
    super("reminder_window_expired_before_provider");
    this.name = "ReminderWindowExpiredBeforeProviderError";
  }
}

function limitSendConcurrency(
  sendPush: SendReminderPush,
  limit: number,
  canStart: () => boolean,
): SendReminderPush {
  let active = 0;
  const queue: Array<() => void> = [];

  return (subscription, payload) => new Promise((resolve, reject) => {
    const run = () => {
      active += 1;
      void Promise.resolve()
        .then(() => {
          if (!canStart()) throw new ReminderWindowExpiredBeforeProviderError();
          return sendPush(subscription, payload);
        })
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          queue.shift()?.();
        });
    };

    if (active < limit) run();
    else queue.push(run);
  });
}

function providerStatusCode(error: unknown) {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return null;
  const statusCode = error.statusCode;
  return typeof statusCode === "number"
    && Number.isInteger(statusCode)
    && statusCode >= 400
    && statusCode <= 599
    ? statusCode
    : null;
}

function payloadFor(
  claim: ReminderClaim,
  deliveryKind: ReminderDeliveryKind,
): PushNotificationPayload {
  const content = getReminderContent(deliveryKind);
  return {
    notificationId: getReminderNotificationId(claim.localDate, claim.slotKey),
    title: content.title,
    body: content.body,
    route: content.route,
  };
}

async function processClaim(
  repository: ReminderDispatchRepository,
  sendPush: SendReminderPush,
  claim: ReminderClaim,
  window: ReminderWindow,
  clock: () => Date,
) {
  const preparedAt = clock();
  const prepared = await repository.prepare(claim, preparedAt.toISOString());
  if (!prepared || prepared.subscriptions.length === 0) return "cancelled" as const;

  const beforeSend = clock();
  if (beforeSend.getTime() >= new Date(window.windowExpiresAt).getTime()) {
    await repository.finalize(claim, {
      outcome: "cancelled",
      deliveryKind: prepared.deliveryKind,
      httpStatus: null,
      errorCode: "window_expired_before_send",
      revokedSubscriptionIds: [],
      now: beforeSend.toISOString(),
    });
    return "cancelled" as const;
  }

  const payload = payloadFor(claim, prepared.deliveryKind);
  const outcomes = await Promise.all(prepared.subscriptions.map(async (subscription) => {
    try {
      await sendPush(subscription, payload);
      return { subscription, success: true as const, statusCode: null };
    } catch (error) {
      return {
        subscription,
        success: false as const,
        statusCode: providerStatusCode(error),
        windowExpiredBeforeProvider:
          error instanceof ReminderWindowExpiredBeforeProviderError,
      };
    }
  }));

  const expiredSubscriptionIds = outcomes.filter(({ success, statusCode }) => (
    !success && (statusCode === 404 || statusCode === 410)
  )).map(({ subscription }) => subscription.id);
  const finalizedAt = clock().toISOString();

  if (outcomes.some(({ success }) => success)) {
    await repository.finalize(claim, {
      outcome: "sent",
      deliveryKind: prepared.deliveryKind,
      httpStatus: null,
      errorCode: null,
      revokedSubscriptionIds: expiredSubscriptionIds,
      now: finalizedAt,
    });
    return "sent" as const;
  }

  const failures = outcomes.filter((outcome) => (
    !outcome.success && !outcome.windowExpiredBeforeProvider
  ));
  const ambiguous = failures.some(({ statusCode }) => statusCode === null);
  if (ambiguous) {
    await repository.finalize(claim, {
      outcome: "permanent_failed",
      deliveryKind: prepared.deliveryKind,
      httpStatus: null,
      errorCode: "provider_outcome_unknown",
      revokedSubscriptionIds: expiredSubscriptionIds,
      now: finalizedAt,
    });
    return "permanent_failed" as const;
  }

  const windowSkipped = outcomes.filter((outcome) => (
    !outcome.success && outcome.windowExpiredBeforeProvider
  ));
  if (windowSkipped.length === outcomes.length) {
    await repository.finalize(claim, {
      outcome: "cancelled",
      deliveryKind: prepared.deliveryKind,
      httpStatus: null,
      errorCode: "window_expired_before_send",
      revokedSubscriptionIds: [],
      now: finalizedAt,
    });
    return "cancelled" as const;
  }
  if (windowSkipped.length > 0) {
    await repository.finalize(claim, {
      outcome: "permanent_failed",
      deliveryKind: prepared.deliveryKind,
      httpStatus: null,
      errorCode: "window_expired_during_send",
      revokedSubscriptionIds: expiredSubscriptionIds,
      now: finalizedAt,
    });
    return "permanent_failed" as const;
  }

  if (expiredSubscriptionIds.length === failures.length) {
    await repository.finalize(claim, {
      outcome: "permanent_failed",
      deliveryKind: prepared.deliveryKind,
      httpStatus: failures[0]?.statusCode ?? null,
      errorCode: "all_endpoints_revoked",
      revokedSubscriptionIds: expiredSubscriptionIds,
      now: finalizedAt,
    });
    return "permanent_failed" as const;
  }

  const retryable = failures.filter(({ statusCode }) => (
    statusCode === 429 || (statusCode !== null && statusCode >= 500 && statusCode <= 599)
  ));
  const nonExpiredFailures = failures.filter(({ statusCode }) => (
    statusCode !== 404 && statusCode !== 410
  ));
  if (retryable.length === nonExpiredFailures.length) {
    const representativeStatus = retryable.find(({ statusCode }) => (
      statusCode !== 429
    ))?.statusCode ?? 429;
    await repository.finalize(claim, {
      outcome: "retryable_failed",
      deliveryKind: prepared.deliveryKind,
      httpStatus: representativeStatus,
      errorCode: representativeStatus === 429 ? "provider_429" : "provider_5xx",
      revokedSubscriptionIds: expiredSubscriptionIds,
      now: finalizedAt,
    });
    return "retryable_failed" as const;
  }

  const permanentStatus = nonExpiredFailures.find(({ statusCode }) => (
    statusCode !== null
      && statusCode >= 400
      && statusCode <= 499
      && statusCode !== 429
  ))?.statusCode ?? null;
  await repository.finalize(claim, {
    outcome: "permanent_failed",
    deliveryKind: prepared.deliveryKind,
    httpStatus: permanentStatus,
    errorCode: "provider_4xx",
    revokedSubscriptionIds: expiredSubscriptionIds,
    now: finalizedAt,
  });
  return "permanent_failed" as const;
}

export async function runReminderScheduler(input: {
  window: ReminderWindow;
  now: Date;
  repository: ReminderDispatchRepository;
  sendPush: SendReminderPush;
  clock?: () => Date;
}): Promise<ReminderRunResult> {
  const clock = input.clock ?? (() => input.now);
  const result: ReminderRunResult = {
    claimed: 0,
    sent: 0,
    retryableFailed: 0,
    permanentFailed: 0,
    cancelled: 0,
  };
  const claimNow = clock();
  const windowStartedAt = new Date(input.window.windowStartedAt).getTime();
  const windowExpiresAt = new Date(input.window.windowExpiresAt).getTime();
  if (claimNow.getTime() < windowStartedAt || claimNow.getTime() >= windowExpiresAt) {
    return result;
  }

  const claims = await input.repository.claimDue(input.window, claimNow.toISOString());
  result.claimed = claims.length;
  const sendPush = limitSendConcurrency(
    input.sendPush,
    REMINDER_OUTBOUND_CONCURRENCY,
    () => clock().getTime() < windowExpiresAt,
  );

  for (let offset = 0; offset < claims.length; offset += REMINDER_CLAIM_CONCURRENCY) {
    const settledOutcomes = await Promise.allSettled(
      claims.slice(offset, offset + REMINDER_CLAIM_CONCURRENCY).map((claim) => (
        processClaim(
          input.repository,
          sendPush,
          claim,
          input.window,
          clock,
        )
      )),
    );
    let processingError: unknown = null;
    for (const settled of settledOutcomes) {
      if (settled.status === "rejected") {
        processingError ??= settled.reason;
        continue;
      }
      const outcome = settled.value;
      if (outcome === "sent") result.sent += 1;
      else if (outcome === "retryable_failed") result.retryableFailed += 1;
      else if (outcome === "permanent_failed") result.permanentFailed += 1;
      else result.cancelled += 1;
    }
    if (processingError) throw processingError;
  }

  return result;
}
