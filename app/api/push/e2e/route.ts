import { handlePushE2E, isPushE2EEnabled, type ClaimedPushE2ERun } from "@/lib/push/e2e";
import { assertWebPushConfigured, sendWebPush } from "@/lib/push/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // Lazy initialization keeps disabled requests independent of DB/schema/VAPID availability.
  let admin: ReturnType<typeof createSupabaseAdminClient> | undefined;
  function database() { return admin ??= createSupabaseAdminClient(); }
  return handlePushE2E(request, {
    enabled: () => isPushE2EEnabled(process.env.PUSH_E2E_ENABLED),
    getUserId: async () => {
      const session = await createServerSupabaseClient();
      const { data, error } = await session.auth.getUser();
      return error ? null : data.user?.id ?? null;
    },
    assertConfigured: assertWebPushConfigured,
    claim: async (runId, userId) => {
      const { data, error } = await database().rpc("consume_push_e2e_run", { p_run_id: runId, p_user_id: userId });
      if (error) throw new Error("claim_failed");
      return data as ClaimedPushE2ERun | null;
    },
    finish: async (runId, result) => {
      const { data, error } = await database().from("push_e2e_runs")
        .update(result).eq("id", runId).eq("status", "consumed")
        .is("provider_status", null).is("error_code", null).select("id").single();
      if (error || !data) throw new Error("result_record_failed");
    },
    send: sendWebPush,
    now: Date.now,
  });
}
