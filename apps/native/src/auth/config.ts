import { assertNativeProject, nativeStage, NATIVE_PRODUCTION_CALLBACK } from '../../../../lib/native-environment.ts';

export const CALLBACK_PATH = '/auth/native/callback';
export const STORAGE_KEY = 'addi-native-dev-auth';
export function validateCallbackBase(value: string, stage: 'development' | 'production' = 'development'): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash
    || url.pathname !== CALLBACK_PATH
    || url.hostname === 'localhost' || url.hostname.endsWith('.invalid')) throw new Error('invalid_dev_callback');
  if (stage === 'production') {
    if (url.href !== NATIVE_PRODUCTION_CALLBACK) throw new Error('invalid_production_callback');
  } else if (url.hostname === 'addi-gamma.vercel.app') throw new Error('invalid_dev_callback');
  return url.href;
}
export function readNativeConfig(env: Record<string, string | undefined>) {
  const stage = nativeStage(env.VITE_NATIVE_STAGE);
  const key = env.VITE_NATIVE_SUPABASE_PUBLISHABLE_KEY ?? '';
  const callback = env.VITE_NATIVE_AUTH_CALLBACK ?? '';
  if (!key || !callback) return null;
  if (!key.startsWith('sb_publishable_')) throw new Error('publishable_key_required');
  const url = assertNativeProject(stage, env.VITE_NATIVE_SUPABASE_URL);
  return { stage, url, key, callback: validateCallbackBase(callback, stage),
    storageKey: stage === 'production' ? 'addi-native-production-auth' : STORAGE_KEY };
}
