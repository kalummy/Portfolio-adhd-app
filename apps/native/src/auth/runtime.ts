import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import type { User } from '@supabase/supabase-js';
import { ensureUserProfile } from '../../../../lib/auth/profile';
import { getNativeClient, nativeConfig } from './client';
import { clearNativeStorage, clearVerifiers, secureStorage } from './storage';
import { NativeAuthFlow, AuthFlowError, type Provider } from './flow';
import { router } from '../platform/router';
import { clearNativePushBinding } from '../push/bridge';

export type NativeAuthState = {
  status: 'starting' | 'signed_out' | 'pending' | 'completing' | 'signed_in' | 'unavailable';
  user: User | null; message: string; profile: 'created' | 'existing' | null;
};
let state: NativeAuthState = { status: 'starting', user: null, message: '', profile: null };
const listeners = new Set<() => void>();
export const getNativeAuthSnapshot = () => state;
export function subscribeNativeAuth(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function update(patch: Partial<NativeAuthState>) { state = { ...state, ...patch }; listeners.forEach(fn => fn()); }
let flow: NativeAuthFlow | undefined;
let started: Promise<void> | undefined;
let active = true;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
function failure() { update({ status: 'signed_out', user: null, message: '로그인을 완료하지 못했어요. 다시 시도해주세요.', profile: null }); }
async function complete(redirect = true) {
  const client = getNativeClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('user_validation_failed');
  const user = data.user;
  // Same authoritative profiles.id and upsert as web. No email matching/linking.
  const before = await client.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (before.error) throw new Error('profile_read_failed');
  const profile = await ensureUserProfile(client, user.id);
  if (profile.error) throw new Error('profile_failed');
  update({ status: 'signed_in', user, message: '', profile: before.data ? 'existing' : 'created' });
  if (active) client.auth.startAutoRefresh();
  if (redirect || location.pathname === '/auth/login') router.replace('/');
}
async function receive(raw: string) {
  await started;
  if (!flow) return;
  try { await flow.callback(raw); }
  catch (error) {
    if (error instanceof AuthFlowError && ['invalid_callback', 'no_attempt'].includes(error.reason)) return;
    failure();
  }
}
async function scheduleExpiry() {
  clearTimeout(expiryTimer);
  const attempt = await flow?.pending();
  if (!attempt) return;
  const remaining = attempt.createdAt + 5 * 60_000 - Date.now();
  expiryTimer = setTimeout(() => { void cancelNativeLogin().catch(failure); }, Math.max(0, remaining));
}
export function startNativeAuth() {
  return started ??= (async () => {
    if (!nativeConfig || Capacitor.getPlatform() !== 'android') {
      update({ status: 'unavailable', message: 'Dev 로그인 설정이 필요해요.' }); return;
    }
    if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) throw new Error('secure_random_required');
    const config = nativeConfig;
    const client = getNativeClient();
    flow = new NativeAuthFlow({
      store: secureStorage, callback: nativeConfig.callback, now: Date.now,
      random: () => Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join(''),
      clearVerifier: clearVerifiers,
      authorize: async (provider, redirectTo) => {
        const { data, error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
        if (error || !data.url || !data.flowId) throw new Error('authorize_failed');
        const url = new URL(data.url);
        if (url.origin !== config.url || url.pathname !== '/auth/v1/authorize'
          || url.searchParams.get('code_challenge_method') !== 's256') throw new Error('invalid_authorize');
        return { url: data.url, flowId: data.flowId };
      },
      open: async url => { await Browser.open({ url, toolbarColor: '#fafafb' }); },
      exchange: async (code, flowId) => {
        update({ status: 'completing', message: '' });
        try {
          const { error } = await client.auth.exchangeCodeForSession(code, { flowId });
          if (error) throw new Error('exchange_failed');
          await complete();
        } catch {
          await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
          await clearNativeStorage();
          throw new AuthFlowError('exchange');
        } finally { clearTimeout(expiryTimer); await Browser.close().catch(() => undefined); }
      },
    });
    await App.addListener('appUrlOpen', ({ url }) => { void receive(url).catch(failure); });
    await App.addListener('appStateChange', ({ isActive }) => {
      active = isActive;
      if (isActive && state.status === 'signed_in') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
      if (isActive) void scheduleExpiry().catch(failure);
    });
    await Browser.addListener('browserFinished', () => {
      // Kakao may leave the Custom Tab for its native app. Keep the attempt until
      // explicit cancellation/expiry; TAB_HIDDEN alone is not an OAuth failure.
      if (state.status === 'pending') update({ message: '로그인을 기다리고 있어요. 취소하거나 브라우저에서 계속해주세요.' });
    });
    client.auth.onAuthStateChange((event, session) => {
      // Do not await other Auth methods inside this callback (SDK lock).
      if (event === 'SIGNED_OUT') update({ status: state.status === 'completing' ? 'completing' : 'signed_out', user: null, profile: null });
      if ((event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && state.status === 'signed_in') {
        if (session && session.user.id === state.user?.id) update({ user: session.user });
        else failure();
      }
    });
    const pending = await flow.pending();
    if (pending) { update({ status: 'pending' }); await scheduleExpiry(); }
    else {
      const { data, error } = await client.auth.getSession();
      if (error) throw new Error('session_restore_failed');
      if (data.session) await complete(false);
      else update({ status: 'signed_out' });
    }
    const launch = await App.getLaunchUrl();
    if (launch?.url) queueMicrotask(() => { void receive(launch.url).catch(failure); });
  })().catch(() => { update({ status: 'signed_out', user: null, message: '로그인 상태를 확인하지 못했어요. 다시 시도해주세요.' }); });
}
export async function signInNative(provider: Provider) {
  await startNativeAuth();
  if (!flow || state.user) throw new Error('native_auth_unavailable');
  update({ status: 'pending', message: '' });
  try { await flow.start(provider); await scheduleExpiry(); }
  catch (error) {
    if (error instanceof AuthFlowError && error.reason === 'busy') {
      update({ status: 'pending', message: '이미 로그인을 진행하고 있어요.' });
      return;
    }
    failure(); throw new Error('login_start_failed');
  }
}
export async function cancelNativeLogin() {
  clearTimeout(expiryTimer);
  await flow?.cancel();
  if (!state.user) update({ status: 'signed_out', message: '로그인을 취소했어요.' });
  await Browser.close().catch(() => undefined);
}
export async function signOutNative() {
  await clearNativePushBinding();
  clearTimeout(expiryTimer);
  // Remove mounted account UI immediately, including in-flight repository results.
  update({ status: 'completing', user: null, profile: null, message: '로그아웃하고 있어요.' });
  const client = getNativeClient();
  client.auth.stopAutoRefresh();
  await flow?.cancel();
  try { await client.auth.signOut({ scope: 'local' }); }
  finally {
    await clearNativeStorage();
    update({ status: 'signed_out', user: null, profile: null, message: '' });
    router.replace('/auth/login');
  }
}
export async function requireNativeUser() {
  if (state.status !== 'signed_in' || !state.user) throw new Error('authentication_required');
  const { data, error } = await getNativeClient().auth.getUser();
  if (error || data.user?.id !== state.user.id) throw new Error('authentication_required');
  return data.user;
}
export const handleNativeAuthCallback = receive;
