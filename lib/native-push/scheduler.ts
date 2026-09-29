import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getActiveReminderWindows,
  type ReminderDeliveryKind,
} from "../reminders/policy";
import type { DeliveryOutcome } from "./fcm";

export type Target = {
  transport: "web" | "fcm";
  targetId: string;
  credentials: Record<string, string | object>;
};
export type ReminderSendContext = {
  userId: string;
  localDate: string;
  slotKey: string;
  claimToken: string;
};
export type Transport = (
  target: Target,
  kind: ReminderDeliveryKind,
  deliveryId: string,
  context: ReminderSendContext,
) => Promise<DeliveryOutcome>;

type Claim = {
  user_id: string;
  reminder_date: string;
  reminder_slot: string;
  claim_token: string;
};

const CLAIM_BATCH_LIMIT = 4;
const unknownOutcome: DeliveryOutcome = {
  status: "permanent_failed",
  http: null,
  code: "provider_outcome_unknown",
};
const disabledTarget: DeliveryOutcome = {
  status: "cancelled",
  http: null,
  code: "target_disabled",
};

/** One logical claim freezes its delivery targets in the database. A retry keeps that set. */
export async function runNativeAwareReminders(
  db: SupabaseClient,
  transports: Record<"web" | "fcm", Transport>,
  options: {
    now: Date;
    onlyUserId?: string;
    allowTarget?: (target: Target) => boolean;
    clock?: () => Date;
  },
) {
  let claimed = 0;
  let delivered = 0;
  let failed = 0;
  let cancelled = 0;
  const clock = options.clock ?? (() => options.now);
  for (const window of getActiveReminderWindows(options.now)) {
    if (clock().getTime() >= Date.parse(window.windowExpiresAt)) break;
    const claim = await db.rpc("claim_due_reminder_dispatches_v2", {
      p_reminder_date: window.localDate,
      p_reminder_slot: window.slotKey,
      p_now: clock().toISOString(),
      p_window_expires_at: window.windowExpiresAt,
      p_batch_limit: CLAIM_BATCH_LIMIT,
      p_only_user_id: options.onlyUserId ?? null,
    });
    if (claim.error) throw Error("reminder_claim_failed");
    const rows = (claim.data ?? []) as Claim[];
    claimed += rows.length;
    for (const row of rows) {
      const prepared = await db.rpc("prepare_reminder_dispatch_v2", {
        p_user_id: row.user_id,
        p_reminder_date: row.reminder_date,
        p_reminder_slot: row.reminder_slot,
        p_claim_token: row.claim_token,
        p_now: clock().toISOString(),
      });
      if (prepared.error) throw Error("reminder_prepare_failed");
      if (!prepared.data) continue;
      const { kind, targets } = prepared.data as {
        kind: ReminderDeliveryKind;
        targets: Target[];
      };
      const nativeSelected = targets.some((target) => target.transport === "fcm");
      await Promise.all(targets.map(async (target) => {
        let result = disabledTarget;
        const allowed = !nativeSelected || target.transport === "fcm";
        if (allowed && clock().getTime() < Date.parse(window.windowExpiresAt)
          && (options.allowTarget?.(target) ?? true)) {
          try {
            result = await transports[target.transport](
              target,
              kind,
              `${row.reminder_date}:${row.reminder_slot}:${target.targetId}`,
              {
                userId: row.user_id,
                localDate: row.reminder_date,
                slotKey: row.reminder_slot,
                claimToken: row.claim_token,
              },
            );
          } catch {
            result = unknownOutcome;
          }
        }
        const finish = await db.rpc("finish_reminder_target_v2", {
          p_user_id: row.user_id,
          p_date: row.reminder_date,
          p_slot: row.reminder_slot,
          p_claim: row.claim_token,
          p_transport: target.transport,
          p_target: target.targetId,
          p_outcome: result.status,
          p_http: result.http,
          p_error: result.code,
          p_now: clock().toISOString(),
        });
        if (finish.error || finish.data !== true)
          throw Error("reminder_delivery_save_failed");
        if (result.status === "sent") delivered++;
        else if (result.status === "cancelled") cancelled++;
        else failed++;
      }));
      const finalized = await db.rpc("finalize_reminder_dispatch_v2", {
        p_user_id: row.user_id,
        p_date: row.reminder_date,
        p_slot: row.reminder_slot,
        p_claim: row.claim_token,
        p_now: clock().toISOString(),
      });
      if (finalized.error || typeof finalized.data !== "string")
        throw Error("reminder_finalize_failed");
    }
  }
  return { claimed, delivered, failed, cancelled };
}
