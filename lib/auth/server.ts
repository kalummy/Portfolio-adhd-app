import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getCurrentUser() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function ensureUserProfile(supabase: SupabaseClient, userId: string) {
  const { error } = await supabase
    .from("profiles")
    .upsert(
      { id: userId, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );

  return { error };
}
