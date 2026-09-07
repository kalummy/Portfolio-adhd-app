import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { E2E_CHROME_FINGERPRINT, endpointFingerprint, getE2EOffer } from "./e2e-offer";

export async function getCurrentE2EOffer() {
  let admin: ReturnType<typeof createSupabaseAdminClient> | undefined;
  function database() { return admin ??= createSupabaseAdminClient(); }
  return getE2EOffer({
    enabled: () => process.env.PUSH_E2E_ENABLED,
    scheduler: () => process.env.REMINDER_SCHEDULER_ENABLED,
    getUserId: async () => {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase.auth.getUser();
      return error ? null : data.user?.id ?? null;
    },
    getRuns: async (userId) => {
      const { data, error } = await database().from("push_e2e_runs")
        .select("id,user_id,subscription_id,subscription_fingerprint,status,created_at,expires_at")
        .eq("user_id", userId).eq("status", "ready").gt("expires_at", new Date().toISOString())
        .like("subscription_fingerprint", `${E2E_CHROME_FINGERPRINT}%`).limit(2);
      if (error) throw new Error("e2e_offer_unavailable");
      return data ?? [];
    },
    getTargets: async () => {
      // No keys are read. Small, temporary operator UI; fail closed if the entire set is not returned.
      const { data, count, error } = await database().from("push_subscriptions")
        .select("id,user_id,endpoint,revoked_at", { count: "exact" }).limit(1000);
      if (error) throw new Error("e2e_offer_unavailable");
      return { rows: data ?? [], count };
    },
    now: Date.now,
    fingerprint: endpointFingerprint,
  });
}
