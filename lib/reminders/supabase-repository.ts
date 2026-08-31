import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ReminderClaim,
  ReminderDispatchRepository,
  ReminderFinalization,
  ReminderSubscription,
  PreparedReminder,
} from "./scheduler";
import type {
  ReminderDeliveryKind,
  ReminderSlotKey,
  ReminderWindow,
} from "./policy";

type ClaimRow = {
  user_id: string;
  reminder_date: string;
  reminder_slot: ReminderSlotKey;
  claim_token: string;
  attempt_count: number;
};

type PreparedRow = {
  subscription_id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  delivery_kind: ReminderDeliveryKind;
  attempt_count: number;
};

const REMINDER_CLAIM_BATCH_LIMIT = 4;

export class SupabaseReminderDispatchRepository implements ReminderDispatchRepository {
  constructor(private readonly admin: SupabaseClient) {}

  async claimDue(window: ReminderWindow, now: string): Promise<ReminderClaim[]> {
    const { data, error } = await this.admin.rpc("claim_due_reminder_dispatches", {
      p_reminder_date: window.localDate,
      p_reminder_slot: window.slotKey,
      p_now: now,
      p_window_expires_at: window.windowExpiresAt,
      p_batch_limit: REMINDER_CLAIM_BATCH_LIMIT,
    });
    if (error) throw error;

    return ((data ?? []) as ClaimRow[]).map((row) => ({
      userId: row.user_id,
      localDate: row.reminder_date,
      slotKey: row.reminder_slot,
      claimToken: row.claim_token,
      attemptCount: row.attempt_count,
    }));
  }

  async prepare(claim: ReminderClaim, now: string): Promise<PreparedReminder | null> {
    const { data, error } = await this.admin.rpc("prepare_reminder_dispatch", {
      p_user_id: claim.userId,
      p_reminder_date: claim.localDate,
      p_reminder_slot: claim.slotKey,
      p_claim_token: claim.claimToken,
      p_now: now,
    });
    if (error) throw error;
    const rows = (data ?? []) as PreparedRow[];
    const first = rows[0];
    if (!first) return null;

    const subscriptions: ReminderSubscription[] = rows.map((row) => ({
      id: row.subscription_id,
      userId: row.user_id,
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth },
    }));
    return {
      deliveryKind: first.delivery_kind,
      attemptCount: first.attempt_count,
      subscriptions,
    };
  }

  async finalize(claim: ReminderClaim, finalization: ReminderFinalization) {
    const { data, error } = await this.admin.rpc("finalize_reminder_dispatch", {
      p_user_id: claim.userId,
      p_reminder_date: claim.localDate,
      p_reminder_slot: claim.slotKey,
      p_claim_token: claim.claimToken,
      p_outcome: finalization.outcome,
      p_delivery_kind: finalization.deliveryKind,
      p_http_status: finalization.httpStatus,
      p_error_code: finalization.errorCode,
      p_revoked_subscription_ids: finalization.revokedSubscriptionIds,
      p_now: finalization.now,
    });
    if (error) throw error;
    if (!Array.isArray(data) || data.length !== 1) {
      throw new Error("reminder_finalize_not_applied");
    }
  }
}
