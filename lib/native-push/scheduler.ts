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
export type Transport = (
  target: Target,
  kind: ReminderDeliveryKind,
  deliveryId: string,
) => Promise<DeliveryOutcome>;
/** Additive runner. Production cron stays on its existing Web-only entry until rollout approval.
 * Dev invokes with one explicitly selected user AND target filter; never fans out to Web.
 */
export async function runNativeAwareReminders(
  db: SupabaseClient,
  transports: Record<"web" | "fcm", Transport>,
  options: {
    now: Date;
    onlyUserId: string;
    allowTarget: (target: Target) => boolean;
  },
) {
  let delivered = 0;
  let failed = 0;
  for (const window of getActiveReminderWindows(options.now)) {
    const claim = await db.rpc("claim_due_reminder_dispatches_v2", {
      p_reminder_date: window.localDate,
      p_reminder_slot: window.slotKey,
      p_now: options.now.toISOString(),
      p_window_expires_at: window.windowExpiresAt,
      p_batch_limit: 1,
      p_only_user_id: options.onlyUserId,
    });
    if (claim.error) throw Error("reminder_claim_failed");
    for (const row of claim.data ?? []) {
      const args = {
        p_user_id: row.user_id,
        p_reminder_date: row.reminder_date,
        p_reminder_slot: row.reminder_slot,
        p_claim_token: row.claim_token,
        p_now: options.now.toISOString(),
      };
      const prepared = await db.rpc("prepare_reminder_dispatch_v2", args);
      if (prepared.error) throw Error("reminder_prepare_failed");
      if (!prepared.data) continue;
      const { kind, targets } = prepared.data as {
        kind: ReminderDeliveryKind;
        targets: Target[];
      };
      for (const target of targets) {
        let result: DeliveryOutcome = {
          status: "cancelled",
          http: null,
          code: "target_disabled",
        };
        if (options.allowTarget(target)) {
          try {
            result = await transports[target.transport](
              target,
              kind,
              `${row.reminder_date}:${row.reminder_slot}:${target.targetId}`,
            );
          } catch {
            result = {
              status: "permanent_failed",
              http: null,
              code: "provider_outcome_unknown",
            };
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
          p_now: options.now.toISOString(),
        });
        if (finish.error || finish.data !== true)
          throw Error("reminder_delivery_save_failed");
        if (result.status === "sent") delivered++;
        else if (result.status !== "cancelled") failed++;
      }
      const finalized = await db.rpc("finalize_reminder_dispatch_v2", {
        p_user_id: row.user_id,
        p_date: row.reminder_date,
        p_slot: row.reminder_slot,
        p_claim: row.claim_token,
        p_now: options.now.toISOString(),
      });
      if (finalized.error) throw Error("reminder_finalize_failed");
    }
  }
  return { delivered, failed };
}
