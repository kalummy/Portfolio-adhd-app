import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { DEV_SUPABASE_URL, readNativeConfig, STORAGE_KEY } from './config';
import { secureStorage } from './storage';
export const nativeConfig = readNativeConfig(import.meta.env);
let client: SupabaseClient | undefined;
export function permittedNativeRequest(url: URL) {
  return url.origin === DEV_SUPABASE_URL && !url.username && !url.password
    && (url.pathname.startsWith('/auth/v1/') || url.pathname.startsWith('/rest/v1/'));
}
export function getNativeClient(): SupabaseClient {
  if (!nativeConfig || Capacitor.getPlatform() !== 'android') throw new Error('native_auth_not_configured');
  return client ??= createClient(nativeConfig.url, nativeConfig.key, {
    auth: { storage: secureStorage, storageKey: STORAGE_KEY, flowType: 'pkce', detectSessionInUrl: false,
      persistSession: true, autoRefreshToken: false, debug: false },
    global: { fetch: (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (!permittedNativeRequest(url)) return Promise.reject(new Error('native_transport_denied'));
      const timeout = AbortSignal.timeout(15_000);
      return fetch(input, { ...init, redirect: 'error', credentials: 'omit',
        signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
    } },
  });
}
// Native-only Vite alias used by existing repository factories; web remains cookie based.
export const createBrowserSupabaseClient = getNativeClient;
