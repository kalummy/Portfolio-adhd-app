import { signInNative, handleNativeAuthCallback, signOutNative } from '../auth/runtime';
/** Auth is native. Server API operations and Push remain unavailable. */
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
const authUnavailable = async (): Promise<never> => { throw new PhaseUnavailableError(2); };
const pushUnavailable = async (): Promise<never> => { throw new PhaseUnavailableError(3); };
export const nativeAuth: NativeAuthAdapter = { signIn: signInNative, handleCallback: handleNativeAuthCallback, signOut: signOutNative };
export const nativeApi: NativeApiAdapter = { request: authUnavailable };
export const nativePush: NativePushAdapter = { register: pushUnavailable, unregister: pushUnavailable };
