export function isNotificationPreviewEnvironment() {
  return process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV === "development";
}

const NOTIFICATION_DEV_SUPABASE_HOST = "ohobxicxchkaisxxswkk.supabase.co";

export function isNotificationPushTestEnvironment() {
  if (!isNotificationPreviewEnvironment()) return false;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) return false;

  try {
    return new URL(supabaseUrl).hostname === NOTIFICATION_DEV_SUPABASE_HOST;
  } catch {
    return false;
  }
}
