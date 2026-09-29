declare const __ADDI_NATIVE_ENV__: { stage: 'development' | 'production'; url: string; callback: string };
const buildEnvironment = typeof __ADDI_NATIVE_ENV__ === 'undefined' ? undefined : __ADDI_NATIVE_ENV__;
export const CALLBACK_PATH = '/auth/native/callback';
export function nativeStage(value: string | undefined): 'development' | 'production' {
  if (value === 'development' || value === 'production') return value;
  throw new Error('native_stage_required');
}
export function validateCallbackBase(value: string, expected: {stage: 'development' | 'production'; callback: string}): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash
    || url.pathname !== CALLBACK_PATH
    || url.hostname === 'localhost' || url.hostname.endsWith('.invalid')) throw new Error('invalid_dev_callback');
  if (url.href !== expected.callback)
    throw new Error('native_callback_stage_mismatch');
  return url.href;
}
export function readNativeConfig(env: Record<string, string | undefined>, expected = buildEnvironment) {
  if (!expected) throw new Error('native_build_environment_missing');
  const stage = nativeStage(env.VITE_NATIVE_STAGE);
  const key = env.VITE_NATIVE_SUPABASE_PUBLISHABLE_KEY ?? '';
  const callback = env.VITE_NATIVE_AUTH_CALLBACK ?? '';
  const url = env.VITE_NATIVE_SUPABASE_URL ?? '';
  if (!key || !callback || !url) throw new Error('native_config_required');
  if (!key.startsWith('sb_publishable_')) throw new Error('publishable_key_required');
  if (stage !== expected.stage || url !== expected.url) throw new Error('native_project_mismatch');
  return { stage, url, key, callback: validateCallbackBase(callback, expected),
    nativeApiUrl: `${url}/functions/v1/native-api`,
    nativePushUrl: `${url}/functions/v1/native-push`,
    storageKey: stage === 'production' ? 'addi-native-production-auth' : 'addi-native-dev-auth' };
}
