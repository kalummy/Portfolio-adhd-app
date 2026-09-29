export const NATIVE_PRODUCTION_SUPABASE_URL = "https://joffvlsyxivveqycjrio.supabase.co";
export const NATIVE_PRODUCTION_CALLBACK = "https://addi-gamma.vercel.app/auth/native/callback";

export type NativeStage = "development" | "production";

export function nativeStage(value: string | undefined): NativeStage {
  if (!value || value === "development") return "development";
  if (value === "production") return "production";
  throw new Error("invalid_native_stage");
}

export function assertNativeProject(stage: NativeStage, url: string | undefined) {
  if (!url) throw new Error("native_project_mismatch");
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("native_project_mismatch"); }
  if (parsed.protocol !== "https:" || parsed.origin !== url || !/^[a-z0-9-]+\.supabase\.co$/.test(parsed.hostname)
    || (stage === "production" && url !== NATIVE_PRODUCTION_SUPABASE_URL)
    || (stage === "development" && url === NATIVE_PRODUCTION_SUPABASE_URL))
    throw new Error("native_project_mismatch");
  return url;
}
