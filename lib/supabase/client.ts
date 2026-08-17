import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";

export function createBrowserSupabaseClient() {
  const { url, publishableKey } = getSupabaseConfig();
  return createBrowserClient(url, publishableKey);
}
