import { fetchNativeApi } from '../api/client';
import { signInNative, handleNativeAuthCallback, signOutNative } from '../auth/runtime';
/** Auth and Push use native adapters; unrelated same-origin APIs remain unavailable. */
export interface NativeAuthAdapter {
  signIn(provider: 'google' | 'kakao'): Promise<void>;
  handleCallback(url: string): Promise<void>;
  signOut(): Promise<void>;
}
export interface NativeApiAdapter {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}
export interface NativePushAdapter {
  register(): Promise<void>;
  unregister(): Promise<void>;
}
export class PhaseUnavailableError extends Error {
  constructor(public readonly phase: 2 | 3) { super(`Phase ${phase}에서 연결할 기능이에요.`); }
}


export const nativeAuth: NativeAuthAdapter = { signIn: signInNative, handleCallback: handleNativeAuthCallback, signOut: signOutNative };
export const nativeApi: NativeApiAdapter = { async request<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetchNativeApi(path, init); if (!response.ok) throw new Error('native_api_failed'); return response.json() as Promise<T>; } };
export const nativePush: NativePushAdapter = { register: async () => { await (await import('../push/runtime')).requestPushSubscription(); }, unregister: async () => (await import('../push/runtime')).unsubscribeFromPush() };
