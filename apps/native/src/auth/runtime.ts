import { trackLoginCompleted, resetAnalyticsSession } from '../adapters/analytics';
import { resetAnalyticsIdentity } from '../adapters/analytics-transport';
import { handleIdentityCallback, cancelIdentityLink, refreshIdentityLinkScreen } from './identities';
import { nativeMoodDrafts } from '../api/mood-draft-store';
import { measureNative, markNative } from '../platform/performance';
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
import { clearDeletedAccountLocalData as clearNativeAccountLocalData } from '../adapters/account-deletion';
import {
  clearCleanupRecovery, readCleanupRecovery, writeCleanupRecovery,
  type CleanupReason, type CleanupResult, type CleanupStep,
} from '../../../../lib/account-cleanup';

export type NativeAuthState = {
  status: 'starting' | 'signed_out' | 'pending' | 'completing' | 'signed_in' | 'unavailable';
  user: User | null; message: string; profile: 'created' | 'existing' | null;
  cleanupPending: boolean;
  cleanupFailedSteps: readonly CleanupStep[];
  accountDeletionConfirmed: boolean;
};
let state: NativeAuthState = {
  status: 'starting', user: null, message: '', profile: null,
  cleanupPending: false, cleanupFailedSteps: [], accountDeletionConfirmed: false,
};
const listeners = new Set<() => void>();
export const getNativeAuthSnapshot = () => state;
export function subscribeNativeAuth(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function update(patch: Partial<NativeAuthState>) { state = { ...state, ...patch }; listeners.forEach(fn => fn()); }
let flow: NativeAuthFlow | undefined;
let started: Promise<void> | undefined;
let active = true;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
let authGeneration = 0;
let cleanupReason: CleanupReason = 'logout';
let cleanupTask: Promise<CleanupResult> | undefined;
// A timed-out Promise is still running. Keep it until it actually settles so a
// retry cannot duplicate an old clear or release a later account underneath it.
const cleanupActions = new Map<CleanupStep, Promise<unknown>>();
const authWork = new Set<Promise<unknown>>();
let refreshStopTask: Promise<unknown> | undefined;
const CLEANUP_STEP_TIMEOUT_MS = 10_000;

function trackAuthWork<T>(task: Promise<T>): Promise<T> {
  authWork.add(task);
  void task.then(() => authWork.delete(task), () => authWork.delete(task));
  return task;
}
async function drainAuthWork() {
  while (authWork.size) await Promise.allSettled([...authWork]);
}
function stopRefresh(client: ReturnType<typeof getNativeClient>) {
  if (refreshStopTask) return refreshStopTask;
  const task = Promise.resolve().then(() => client.auth.stopAutoRefresh());
  refreshStopTask = task;
  // This Promise may reject before the Auth cleanup phase starts. Observe it
  // here, then classify it with signOut under the fixed 'auth' result label.
  void task.then(
    () => { if (refreshStopTask === task) refreshStopTask = undefined; },
    () => { if (refreshStopTask === task) refreshStopTask = undefined; },
  );
  return task;
}

function failure() {
  if (state.cleanupPending || cleanupTask) return;
  update({ status: 'signed_out', user: null, message: '로그인을 완료하지 못했어요. 다시 시도해주세요.', profile: null });
}
function assertAuthGeneration(generation: number) {
  if (generation !== authGeneration || state.cleanupPending || cleanupTask)
    throw new Error('native_auth_boundary_changed');
}
function complete(redirect = true, generation = authGeneration) {
  return trackAuthWork(completeAuth(redirect, generation));
}
async function completeAuth(redirect: boolean, generation: number) {
  const client = getNativeClient();
  const { data, error } = await measureNative("auth.validate", () => client.auth.getUser());
  assertAuthGeneration(generation);
  if (error || !data.user) throw new Error('user_validation_failed');
  const user = data.user;
  // Same authoritative profiles.id and upsert as web. No email matching/linking.
  const before = await measureNative('auth.profile.read', async () => client.from('profiles').select('id').eq('id', user.id).maybeSingle());
  assertAuthGeneration(generation);
  if (before.error) throw new Error('profile_read_failed');
  if (!before.data) {
    const profile = await measureNative('auth.profile.create', () => ensureUserProfile(client, user.id));
    assertAuthGeneration(generation);
    if (profile.error) throw new Error('profile_failed');
  }
  await nativeMoodDrafts.restore(user.id);
  assertAuthGeneration(generation);
  markNative('auth.ready');
  update({ status: 'signed_in', user, message: '', profile: before.data ? 'existing' : 'created',
    accountDeletionConfirmed: false });
  if (active) client.auth.startAutoRefresh();
  if (redirect) trackLoginCompleted();
  if (redirect || location.pathname === '/auth/login') {
    const next = await secureStorage.getItem('addi-native-auth-return');
    assertAuthGeneration(generation);
    await secureStorage.removeItem('addi-native-auth-return');
    assertAuthGeneration(generation);
    router.replace(next === '/delete-account' ? next : '/');
  }
}
async function receive(raw: string) {
  await started;
  if (state.cleanupPending || cleanupTask) return;
  const generation = authGeneration;
  if (await handleIdentityCallback(raw)) return;
  if (!flow || generation !== authGeneration || state.cleanupPending) return;
  try { await flow.callback(raw); }
  catch (error) {
    if (generation !== authGeneration || state.cleanupPending) return;
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
  const generation = authGeneration;
  return started ??= (async () => {
    markNative('auth.start');
    if (!nativeConfig || Capacitor.getPlatform() !== 'android') {
      update({ status: 'unavailable', message: '로그인 설정이 필요해요.' }); return;
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
      exchange: (code, flowId) => trackAuthWork((async () => {
        const exchangeGeneration = authGeneration;
        assertAuthGeneration(exchangeGeneration);
        update({ status: 'completing', message: '' });
        try {
          const { error } = await client.auth.exchangeCodeForSession(code, { flowId });
          assertAuthGeneration(exchangeGeneration);
          if (error) throw new Error('exchange_failed');
          await complete(true, exchangeGeneration);
        } catch {
          // A logout coordinator owns cleanup after its generation changes.
          // An old exchange must not clear a later authenticated lifecycle.
          if (exchangeGeneration === authGeneration && !state.cleanupPending) {
            await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
            await clearNativeStorage();
          }
          throw new AuthFlowError('exchange');
        } finally { clearTimeout(expiryTimer); await Browser.close().catch(() => undefined); }
      })()),
    });
    await App.addListener('appUrlOpen', ({ url }) => { void receive(url).catch(failure); });
    await App.addListener('appStateChange', ({ isActive }) => {
      active = isActive;
      if (isActive && state.status === 'signed_in') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
      if (isActive && !state.cleanupPending) void scheduleExpiry().catch(failure);
    });
    await Browser.addListener('browserFinished', () => {
      if (state.cleanupPending) return;
      void refreshIdentityLinkScreen().catch(() => undefined);
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
    const recovery = readCleanupRecovery();
    if (recovery) {
      cleanupReason = recovery.reason;
      authGeneration++;
      update({ status: 'signed_out', user: null, profile: null, cleanupPending: true,
        cleanupFailedSteps: [], accountDeletionConfirmed: false,
        message: '이 기기에 정리할 정보가 남아 있어요. 정리를 다시 시도해주세요.' });
      router.replace('/auth/login');
      return;
    }
    const pending = await flow.pending();
    assertAuthGeneration(generation);
    if (pending) { update({ status: 'pending' }); await scheduleExpiry(); }
    else {
      const { data, error } = await trackAuthWork(measureNative("auth.session.restore", () => client.auth.getSession()));
      assertAuthGeneration(generation);
      if (error) throw new Error('session_restore_failed');
      if (data.session) await complete(false, generation);
      else update({ status: 'signed_out' });
    }
    const launch = await App.getLaunchUrl();
    if (launch?.url) queueMicrotask(() => { void receive(launch.url).catch(failure); });
  })().catch(() => {
    if (generation === authGeneration && !state.cleanupPending)
      update({ status: 'signed_out', user: null, message: '로그인 상태를 확인하지 못했어요. 다시 시도해주세요.' });
  });
}
export function signInNative(provider: Provider, nextPath = '/') {
  return trackAuthWork(beginNativeSignIn(provider, nextPath));
}
async function beginNativeSignIn(provider: Provider, nextPath: string) {
  const generation = authGeneration;
  await startNativeAuth();
  assertAuthGeneration(generation);
  if (state.cleanupPending || cleanupTask || readCleanupRecovery()) throw new Error('native_cleanup_required');
  if (!flow || state.user) throw new Error('native_auth_unavailable');
  update({ status: 'pending', message: '', accountDeletionConfirmed: false });
  try {
    await secureStorage.setItem('addi-native-auth-return', nextPath === '/delete-account' ? nextPath : '/');
    assertAuthGeneration(generation);
    await flow.start(provider);
    assertAuthGeneration(generation);
    await scheduleExpiry();
    assertAuthGeneration(generation);
  }
  catch (error) {
    if (generation !== authGeneration || state.cleanupPending) throw new Error('native_auth_boundary_changed');
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
  if (!state.user && !state.cleanupPending) update({ status: 'signed_out', message: '로그인을 취소했어요.' });
  await Browser.close().catch(() => undefined);
}
async function runNativeCleanup(requestedReason: CleanupReason): Promise<CleanupResult> {
  if (cleanupTask) {
    // A confirmed deletion must not inherit the narrower data scope of an
    // already-running ordinary logout.
    if (requestedReason === 'account_deletion' && cleanupReason !== 'account_deletion')
      return cleanupTask.then(() => runNativeCleanup('account_deletion'));
    return cleanupTask;
  }
  const recovery = readCleanupRecovery();
  const reason = requestedReason === 'account_deletion' || recovery?.reason === 'account_deletion'
    || (state.cleanupPending && cleanupReason === 'account_deletion') ? 'account_deletion' : 'logout';
  cleanupReason = reason;
  authGeneration++;
  clearTimeout(expiryTimer);
  // Do this synchronously: slow/rejected platform calls must not leave private UI mounted.
  update({ status: 'completing', user: null, profile: null, cleanupPending: true,
    cleanupFailedSteps: [], message: '기기 정보를 정리하고 있어요.' });
  const run = (async (): Promise<CleanupResult> => {
    const failed = new Set<CleanupStep>();
    if (!writeCleanupRecovery(reason)) failed.add('recovery');
    let client: ReturnType<typeof getNativeClient> | undefined;
    let earlyStop: Promise<unknown> | undefined;
    try {
      client = getNativeClient();
      if (!cleanupActions.has('auth')) earlyStop = stopRefresh(client);
    }
    catch { failed.add('auth'); }
    const attempt = async (step: CleanupStep, action: () => unknown | Promise<unknown>) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let task = cleanupActions.get(step);
      if (!task) {
        task = Promise.resolve().then(action);
        cleanupActions.set(step, task);
        const current = task;
        void task.then(
          () => { if (cleanupActions.get(step) === current) cleanupActions.delete(step); },
          () => { if (cleanupActions.get(step) === current) cleanupActions.delete(step); },
        );
      }
      try {
        await Promise.race([
          task,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('cleanup_step_timeout')), CLEANUP_STEP_TIMEOUT_MS);
          }),
        ]);
      } catch { failed.add(step); }
      finally { clearTimeout(timer); }
    };
    try {
      // These steps are independent. One plugin error cannot suppress another cleanup attempt.
      await Promise.all([
        attempt('analytics', () => {
          let rejected = false;
          try { resetAnalyticsSession(); } catch { rejected = true; }
          try { if (!resetAnalyticsIdentity()) rejected = true; } catch { rejected = true; }
          if (rejected) throw new Error('analytics_cleanup_pending');
        }),
        attempt('drafts', () => nativeMoodDrafts.lock()),
        attempt('identity_link', cancelIdentityLink),
        attempt('push', clearNativePushBinding),
        attempt('auth_flow', async () => {
          let rejected = false;
          try { await flow?.cancel(); } catch { rejected = true; }
          await drainAuthWork();
          if (rejected) throw new Error('auth_flow_cleanup_pending');
        }),
      ]);
    } finally {
      // Auth and secure-storage cleanup run even when an earlier platform step failed/timed out.
      await attempt('auth', async () => {
        const currentClient = client ?? getNativeClient();
        const results = await Promise.allSettled([
          earlyStop ?? stopRefresh(currentClient),
          Promise.resolve().then(async () => {
            const result = await currentClient.auth.signOut({ scope: 'local' });
            if (result.error) throw new Error('auth_cleanup_pending');
          }),
        ]);
        if (results.some(result => result.status === 'rejected')) throw new Error('auth_cleanup_pending');
      });
      await attempt('secure_storage', clearNativeStorage);
      if (reason === 'account_deletion') await attempt('local_data', clearNativeAccountLocalData);
    }
    // Timers do not cancel platform/SDK operations. Keep the boundary closed
    // until a later retry has observed settlement and performed final cleanup.
    for (const step of cleanupActions.keys()) failed.add(step);
    if (authWork.size) failed.add('auth_flow');
    if (failed.size === 0) {
      if (!clearCleanupRecovery()) failed.add('recovery');
    } else if (!writeCleanupRecovery(reason)) failed.add('recovery');
    const result: CleanupResult = { status: failed.size ? 'pending' : 'complete', failedSteps: [...failed] };
    update({ status: 'signed_out', user: null, profile: null,
      cleanupPending: result.status === 'pending', cleanupFailedSteps: result.failedSteps,
      message: result.status === 'pending'
        ? state.accountDeletionConfirmed
          ? '계정 삭제는 완료됐지만 이 기기의 일부 정보는 정리하지 못했어요. 다시 시도해주세요.'
          : '이 기기의 일부 정보를 정리하지 못했어요. 정리를 다시 시도해주세요.'
        : '' });
    router.replace('/auth/login');
    return result;
  })();
  cleanupTask = run.finally(() => { cleanupTask = undefined; });
  return cleanupTask;
}

export async function signOutNative() {
  const result = await runNativeCleanup('logout');
  if (result.status !== 'complete') throw new Error('native_cleanup_pending');
}

/** Called only after the current caller has received a successful server DELETE response. */
export function completeDeletedAccountCleanup(): Promise<CleanupResult> {
  update({ accountDeletionConfirmed: true });
  return runNativeCleanup('account_deletion');
}

/** Local/session cleanup only. Never sends DELETE or treats a cold hint as server proof. */
export function retryDeletedAccountCleanup(): Promise<CleanupResult> {
  const recovery = readCleanupRecovery();
  if (!state.cleanupPending && !cleanupTask && !recovery)
    return Promise.resolve({ status: 'complete', failedSteps: [] });
  return runNativeCleanup(recovery?.reason ?? cleanupReason);
}

export const retryNativeCleanup = retryDeletedAccountCleanup;

export function getPendingDeletedAccountCleanup(): boolean {
  return (state.cleanupPending && cleanupReason === 'account_deletion')
    || readCleanupRecovery()?.reason === 'account_deletion';
}
export async function requireNativeUser() {
  if (state.cleanupPending || state.status !== 'signed_in' || !state.user) throw new Error('authentication_required');
  const generation = authGeneration;
  const owner = state.user.id;
  const { data, error } = await getNativeClient().auth.getUser();
  if (generation !== authGeneration || state.cleanupPending || error || data.user?.id !== owner
    || state.user?.id !== owner) throw new Error('authentication_required');
  return data.user;
}
export const handleNativeAuthCallback = receive;
