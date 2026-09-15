/** Phase 2 can only target the existing isolated ADDI Dev project. */
export const DEV_SUPABASE_URL = 'https://ohobxicxchkaisxxswkk.supabase.co';
export const CALLBACK_PATH = '/auth/native/callback';
export const STORAGE_KEY = 'addi-native-dev-auth';
export function validateCallbackBase(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash
    || url.pathname !== CALLBACK_PATH || url.hostname === 'addi-gamma.vercel.app'
    || url.hostname === 'localhost' || url.hostname.endsWith('.invalid')) throw new Error('invalid_dev_callback');
  return url.href;
}
export function readNativeConfig(env: Record<string, string | undefined>) {
  const key = env.VITE_NATIVE_SUPABASE_PUBLISHABLE_KEY ?? '';
  const callback = env.VITE_NATIVE_AUTH_CALLBACK ?? '';
  if (!key || !callback) return null;
  if (!key.startsWith('sb_publishable_')) throw new Error('publishable_key_required');
  if (env.VITE_NATIVE_SUPABASE_URL && env.VITE_NATIVE_SUPABASE_URL !== DEV_SUPABASE_URL) throw new Error('dev_only');
  return { url: DEV_SUPABASE_URL, key, callback: validateCallbackBase(callback) };
}
