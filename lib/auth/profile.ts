import type { SupabaseClient } from "@supabase/supabase-js";

export async function ensureUserProfile(supabase: SupabaseClient, userId: string) {
  const { error } = await supabase
    .from("profiles")
    .upsert(
      { id: userId, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );

  return { error };
}
