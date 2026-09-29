import "server-only";

import { assertNativeProject, nativeStage } from "../native-environment";
import { webReminderTransport } from "./web-transport";
import type { Transport } from "./scheduler";

/** The matching environment's Edge owns FCM; the cron passes only a frozen DB claim. */
export function createReminderTransports(): Record<"web" | "fcm", Transport> {
  const stage = nativeStage(process.env.ADDI_NATIVE_STAGE ?? (process.env.VERCEL_ENV === "production" ? "production" : undefined));
  const supabaseUrl = assertNativeProject(stage, process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) throw Error("supabase_admin_not_configured");
  return {
    web: webReminderTransport,
    fcm: async (target, kind, _deliveryId, context) => {
      if (target.transport !== "fcm") throw Error("invalid_fcm_target");
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/native-push/scheduler-send`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: context.userId,
            date: context.localDate,
            slot: context.slotKey,
            claimToken: context.claimToken,
            targetId: target.targetId,
            kind,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) throw Error("fcm_proxy_unavailable");
        const result = await response.json();
        if (result?.status === "sent" && result.http === null && result.code === null)
          return result;
        if (result?.status === "retryable_failed"
          && ((result.http === 429 && result.code === "provider_429")
            || (result.http >= 500 && result.http <= 599 && result.code === "provider_5xx")))
          return result;
        if (result?.status === "permanent_failed"
          && ((result.code === "provider_4xx" && result.http >= 400 && result.http <= 499)
            || (result.code === "unregistered" && result.http === 404)
            || (result.code === "provider_outcome_unknown" && result.http === null)))
          return result;
        throw Error("invalid_fcm_proxy_result");
      } catch {
        return { status: "permanent_failed", http: null, code: "provider_outcome_unknown" };
      }
    },
  };
}

export const createDevReminderTransports = createReminderTransports;
