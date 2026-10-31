import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const RUNTIME = path.join(ROOT, 'apps/native/src/auth/runtime.ts');
const RECOVERY_KEY = 'addi_privacy_cleanup_required_v1';

class MemoryStorage {
  data = new Map();
  get length() { return this.data.size; }
  key(index) { return [...this.data.keys()][index] ?? null; }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

async function setup({ failure, recovery, signedIn = true, deferSession = false, hang } = {}) {
  const calls = Object.create(null);
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  if (recovery) localStorage.setItem(RECOVERY_KEY, JSON.stringify({ version: 1, reason: recovery }));
  const h = {
    calls, failure, hang, user: signedIn ? { id: 'SYNTHETIC_ACCOUNT_A' } : null,
    routes: [], providers: [], networkRequests: 0, authListener: undefined,
    resolveSession: undefined, sessionStarted: undefined, deferredStep: undefined, resolveStep: undefined,
    resolveExchange: undefined, deferExchange: false, storedOwner: signedIn ? 'SYNTHETIC_ACCOUNT_A' : null,
    deferRefreshStop: false, resolveRefreshStop: undefined,
    deferReturnWrite: false, resolveReturnWrite: undefined,
  };
  h.sessionStarted = new Promise(resolve => { h.sessionRequested = resolve; });
  h.hit = key => {
    calls[key] = (calls[key] ?? 0) + 1;
    if (h.failure === key) throw new Error('synthetic_cleanup_failure');
    if (h.deferredStep === key) return new Promise(resolve => { h.resolveStep = resolve; });
    if (h.hang === key) return new Promise(() => {});
  };
  h.client = {
    auth: {
      getSession: async () => {
        calls.getSession = (calls.getSession ?? 0) + 1;
        h.sessionRequested();
        if (deferSession) return new Promise(resolve => { h.resolveSession = resolve; });
        return { data: { session: h.user ? { user: h.user } : null }, error: null };
      },
      getUser: async () => { calls.getUser = (calls.getUser ?? 0) + 1; return { data: { user: h.user }, error: null }; },
      signOut: async () => {
        calls.auth = (calls.auth ?? 0) + 1;
        if (h.failure === 'auth') return { error: new Error('synthetic_cleanup_failure') };
        h.user = null; h.storedOwner = null; h.authListener?.('SIGNED_OUT', null); return { error: null };
      },
      exchangeCodeForSession: async () => {
        calls.exchange = (calls.exchange ?? 0) + 1;
        if (h.deferExchange) return new Promise(resolve => { h.resolveExchange = () => { h.storedOwner = 'SYNTHETIC_ACCOUNT_A'; resolve({ error: null }); }; });
        return { error: null };
      },
      stopAutoRefresh: async () => {
        calls.stopAutoRefresh = (calls.stopAutoRefresh ?? 0) + 1;
        if (h.failure === 'refresh_stop') throw new Error('synthetic_refresh_stop_failure');
        if (h.deferRefreshStop) return new Promise(resolve => { h.resolveRefreshStop = resolve; });
      },
      startAutoRefresh: () => {},
      onAuthStateChange: listener => { h.authListener = listener; return { data: { subscription: { unsubscribe() {} } } }; },
    },
    from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { id: h.user?.id }, error: null }) }),
  };
  const stubs = {
    analytics: `export const trackLoginCompleted=()=>{};export const resetAnalyticsSession=()=>globalThis.__h.hit('analytics');`,
    identity: `export const resetAnalyticsIdentity=()=>true;`,
    links: `export const handleIdentityCallback=async()=>false;export const cancelIdentityLink=async()=>globalThis.__h.hit('identity_link');export const refreshIdentityLinkScreen=async()=>{};`,
    drafts: `export const nativeMoodDrafts={lock:async()=>globalThis.__h.hit('drafts'),restore:async()=>{}};`,
    performance: `export const markNative=()=>{};export const measureNative=async(_name,run)=>run();`,
    app: `export const App={addListener:async()=>({remove(){}}),getLaunchUrl:async()=>null};`,
    browser: `export const Browser={addListener:async()=>({remove(){}}),close:async()=>{},open:async()=>{}};`,
    core: `export const Capacitor={getPlatform:()=> 'android'};`,
    profile: `export const ensureUserProfile=async()=>({error:null});`,
    client: `export const getNativeClient=()=>globalThis.__h.client;export const nativeConfig={url:'https://synthetic.invalid',callback:'https://synthetic.invalid/auth/native/callback'};`,
    storage: `export const secureStorage={getItem:async()=>null,setItem:async()=>{if(globalThis.__h.deferReturnWrite)await new Promise(resolve=>globalThis.__h.resolveReturnWrite=resolve)},removeItem:async()=>{}};export const clearVerifiers=async()=>{};export const clearNativeStorage=async()=>{await globalThis.__h.hit('secure_storage');globalThis.__h.storedOwner=null};`,
    flow: `export class AuthFlowError extends Error{};export class NativeAuthFlow{constructor(deps){this.deps=deps;globalThis.__h.flow=this}async pending(){return null}async cancel(){globalThis.__h.hit('auth_flow');if(this.work)await this.work.catch(()=>{})}async start(provider){globalThis.__h.providers.push(provider)}callback(){return this.work=this.deps.exchange('SYNTHETIC_CODE','SYNTHETIC_FLOW')}}`,
    router: `export const router={replace:path=>globalThis.__h.routes.push(path)};`,
    push: `export const clearNativePushBinding=async()=>globalThis.__h.hit('push');`,
    data: `import {clearDeletedAccountLocalData as actual} from ${JSON.stringify(path.join(ROOT, 'apps/native/src/adapters/account-deletion.ts'))};export async function clearDeletedAccountLocalData(){globalThis.__h.hit('local_data');return actual()}`,
  };
  const runtimeImports = {
    '../adapters/analytics': 'analytics', '../adapters/analytics-transport': 'identity',
    './identities': 'links', '../api/mood-draft-store': 'drafts', '../platform/performance': 'performance',
    '../../../../lib/auth/profile': 'profile', './client': 'client', './storage': 'storage', './flow': 'flow',
    '../platform/router': 'router', '../push/bridge': 'push', '../adapters/account-deletion': 'data',
  };
  const output = await build({
    entryPoints: [RUNTIME], bundle: true, write: false, platform: 'browser', format: 'cjs',
    plugins: [{ name: 'native-cleanup-boundaries', setup(b) {
      b.onResolve({ filter: /.*/ }, args => {
        const special = ({ '@capacitor/app': 'app', '@capacitor/browser': 'browser', '@capacitor/core': 'core' })[args.path]
          ?? (args.importer === RUNTIME ? runtimeImports[args.path] : undefined);
        if (special) return { path: special, namespace: 'mock' };
        if (args.kind === 'entry-point') return { path: args.path };
        let p = args.path.startsWith('@/') ? path.join(ROOT, args.path.slice(2))
          : path.isAbsolute(args.path) ? args.path : path.resolve(path.dirname(args.importer), args.path);
        if (!path.extname(p)) p += '.ts';
        return { path: p };
      });
      b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: stubs[args.path], loader: 'ts' }));
    } }],
  });
  let timerId = 0; const timers = new Map();
  h.fireTimeouts = () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } };
  const context = vm.createContext({
    module: { exports: {} }, __h: h, console, crypto: webcrypto,
    window: { localStorage, sessionStorage }, localStorage, sessionStorage,
    location: { pathname: '/auth/login' },
    setTimeout: fn => { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id), queueMicrotask,
    Uint8Array, URL, URLSearchParams, Date, Promise,
    fetch: () => { h.networkRequests++; throw new Error('NETWORK_FORBIDDEN'); },
  });
  vm.runInContext(output.outputFiles[0].text, context, { filename: 'actual-native-runtime.test.cjs' });
  return { runtime: context.module.exports, h, localStorage, sessionStorage };
}

test('normal Native logout clears Auth and secure storage without changing providers', async () => {
  const { runtime, h } = await setup(); await runtime.startNativeAuth();
  assert.equal(runtime.getNativeAuthSnapshot().status, 'signed_in');
  await runtime.signOutNative();
  assert.equal(h.calls.auth, 1); assert.equal(h.calls.secure_storage, 1);
  assert.equal(runtime.getNativeAuthSnapshot().user, null);
  assert.equal(runtime.getNativeAuthSnapshot().status, 'signed_out');
  assert.equal(h.routes.at(-1), '/auth/login'); assert.equal(h.networkRequests, 0);
});

test('Push rejection cannot skip Auth and secure cleanup', async () => {
  const { runtime, h } = await setup(); await runtime.startNativeAuth(); h.failure = 'push';
  await assert.rejects(runtime.signOutNative());
  assert.equal(h.calls.auth, 1); assert.equal(h.calls.secure_storage, 1);
  assert.equal(runtime.getNativeAuthSnapshot().user, null);
  assert.equal(runtime.getNativeAuthSnapshot().cleanupPending, true);
});

for (const failure of ['analytics', 'drafts', 'identity_link', 'auth_flow', 'auth', 'secure_storage']) {
  test(`${failure} failure still attempts remaining Native cleanup`, async () => {
    const { runtime, h } = await setup(); await runtime.startNativeAuth(); h.failure = failure;
    await assert.rejects(runtime.signOutNative());
    assert.equal(h.calls.auth, 1); assert.equal(h.calls.secure_storage, 1);
    const state = runtime.getNativeAuthSnapshot();
    assert.equal(state.user, null); assert.equal(state.status, 'signed_out');
    assert.equal(state.cleanupPending, true); assert.ok(state.cleanupFailedSteps.includes(failure));
    const providerCalls = h.providers.length;
    await assert.rejects(runtime.signInNative('google'));
    assert.equal(h.providers.length, providerCalls); assert.equal(h.networkRequests, 0);
  });
}

test('Native deletion cleanup retries locally without sending DELETE or restoring private user', async () => {
  const { runtime, h, localStorage, sessionStorage } = await setup(); await runtime.startNativeAuth();
  localStorage.setItem('addi:fixture', 'SYNTHETIC'); sessionStorage.setItem('addi:fixture', 'SYNTHETIC'); h.failure = 'push';
  const pending = await runtime.completeDeletedAccountCleanup();
  assert.equal(pending.status, 'pending'); assert.ok(pending.failedSteps.includes('push'));
  assert.equal(runtime.getNativeAuthSnapshot().accountDeletionConfirmed, true);
  assert.equal(localStorage.getItem('addi:fixture'), null); assert.ok(localStorage.getItem(RECOVERY_KEY));
  h.failure = undefined;
  const complete = await runtime.retryDeletedAccountCleanup();
  assert.equal(complete.status, 'complete'); assert.equal(localStorage.getItem(RECOVERY_KEY), null);
  assert.equal(runtime.getNativeAuthSnapshot().user, null); assert.equal(runtime.getNativeAuthSnapshot().cleanupPending, false);
  assert.equal(h.networkRequests, 0);
});

test('cold recovery hint blocks session restoration and never proves server deletion', async () => {
  const { runtime, h, localStorage } = await setup({ recovery: 'account_deletion' });
  await runtime.startNativeAuth();
  assert.equal(h.calls.getSession ?? 0, 0); assert.equal(h.calls.getUser ?? 0, 0);
  assert.equal(runtime.getNativeAuthSnapshot().user, null); assert.equal(runtime.getNativeAuthSnapshot().cleanupPending, true);
  assert.equal(runtime.getNativeAuthSnapshot().accountDeletionConfirmed, false);
  const result = await runtime.retryDeletedAccountCleanup();
  assert.equal(result.status, 'complete'); assert.equal(localStorage.getItem(RECOVERY_KEY), null);
  assert.equal(runtime.getNativeAuthSnapshot().accountDeletionConfirmed, false); assert.equal(h.networkRequests, 0);
});

test('late startup session cannot restore the previous account after logout', async () => {
  const { runtime, h } = await setup({ deferSession: true });
  const startup = runtime.startNativeAuth(); await h.sessionStarted;
  const logout = runtime.signOutNative();
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.equal(runtime.getNativeAuthSnapshot().user, null);
  h.resolveSession({ data: { session: { user: { id: 'SYNTHETIC_ACCOUNT_A' } } }, error: null });
  await Promise.all([startup, logout]);
  assert.equal(runtime.getNativeAuthSnapshot().status, 'signed_out'); assert.equal(runtime.getNativeAuthSnapshot().user, null);
  assert.equal(h.calls.getUser ?? 0, 0);
});

test('timed-out secure clear is not duplicated and cannot run underneath a new login', async () => {
  const { runtime, h } = await setup(); await runtime.startNativeAuth(); h.deferredStep = 'secure_storage';
  const logout = runtime.signOutNative();
  for (let i = 0; i < 50; i++) await Promise.resolve();
  h.fireTimeouts(); await assert.rejects(logout);
  assert.equal(h.calls.secure_storage, 1);
  const retry = runtime.retryNativeCleanup();
  for (let i = 0; i < 50; i++) await Promise.resolve();
  h.fireTimeouts(); assert.equal((await retry).status, 'pending');
  assert.equal(h.calls.secure_storage, 1);
  await assert.rejects(runtime.signInNative('kakao'));
  assert.equal(h.providers.length, 0);
  h.resolveStep(); h.deferredStep = undefined;
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.equal((await runtime.retryNativeCleanup()).status, 'complete');
  assert.equal(h.calls.secure_storage, 2);
  await runtime.signInNative('kakao'); assert.deepEqual(h.providers, ['kakao']);
});

test('late OAuth exchange storage effects keep cleanup pending until final retry removes them', async () => {
  const { runtime, h } = await setup(); await runtime.startNativeAuth(); h.deferExchange = true;
  const callback = runtime.handleNativeAuthCallback('https://synthetic.invalid/auth/native/callback');
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.equal(typeof h.resolveExchange, 'function');
  const logout = runtime.signOutNative();
  for (let i = 0; i < 50; i++) await Promise.resolve();
  h.fireTimeouts(); await assert.rejects(logout);
  assert.equal(h.storedOwner, null);
  h.resolveExchange(); await callback;
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.equal(h.storedOwner, 'SYNTHETIC_ACCOUNT_A');
  assert.equal(runtime.getNativeAuthSnapshot().user, null);
  await assert.rejects(runtime.signInNative('google'));
  assert.equal((await runtime.retryNativeCleanup()).status, 'complete');
  assert.equal(h.storedOwner, null);
  await runtime.signInNative('google'); assert.deepEqual(h.providers, ['google']);
  assert.equal(h.networkRequests, 0);
});

test('a stalled Push call becomes pending while Auth and secure cleanup still run', async () => {
  const { runtime, h } = await setup({ hang: 'push' }); await runtime.startNativeAuth();
  const logout = runtime.signOutNative();
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.equal(runtime.getNativeAuthSnapshot().user, null);
  assert.equal(h.calls.stopAutoRefresh, 1);
  h.fireTimeouts();
  await assert.rejects(logout);
  assert.equal(h.calls.auth, 1); assert.equal(h.calls.secure_storage, 1);
  assert.ok(runtime.getNativeAuthSnapshot().cleanupFailedSteps.includes('push'));
});

test('async refresh-stop failure still attempts Auth and secure cleanup and is reported', async () => {
  const { runtime, h } = await setup(); await runtime.startNativeAuth(); h.failure = 'refresh_stop';
  await assert.rejects(runtime.signOutNative());
  assert.equal(h.calls.auth, 1); assert.equal(h.calls.secure_storage, 1);
  assert.ok(runtime.getNativeAuthSnapshot().cleanupFailedSteps.includes('auth'));
  assert.equal(runtime.getNativeAuthSnapshot().user, null);
});

test('slow refresh-stop is retained across retries and cannot stop a later account refresh', async () => {
  const { runtime, h } = await setup(); await runtime.startNativeAuth(); h.deferRefreshStop = true;
  const logout = runtime.signOutNative();
  for (let i = 0; i < 50; i++) await Promise.resolve();
  h.fireTimeouts(); await assert.rejects(logout);
  assert.equal(h.calls.auth, 1); assert.equal(h.calls.secure_storage, 1);
  const retry = runtime.retryNativeCleanup();
  for (let i = 0; i < 50; i++) await Promise.resolve();
  h.fireTimeouts(); assert.equal((await retry).status, 'pending');
  assert.equal(h.calls.stopAutoRefresh, 1); assert.equal(h.calls.auth, 1);
  await assert.rejects(runtime.signInNative('google'));
  h.resolveRefreshStop(); h.deferRefreshStop = false;
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.equal((await runtime.retryNativeCleanup()).status, 'complete');
  await runtime.signInNative('google'); assert.deepEqual(h.providers, ['google']);
});

test('a pre-logout login preparation cannot start OAuth after its secure write finishes late', async () => {
  const { runtime, h } = await setup({ signedIn: false }); await runtime.startNativeAuth(); h.deferReturnWrite = true;
  const login = runtime.signInNative('google');
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.equal(typeof h.resolveReturnWrite, 'function');
  const logout = runtime.signOutNative();
  for (let i = 0; i < 50; i++) await Promise.resolve();
  h.fireTimeouts(); await assert.rejects(logout);
  h.resolveReturnWrite(); h.deferReturnWrite = false; await assert.rejects(login);
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.equal(h.providers.length, 0);
  assert.equal((await runtime.retryNativeCleanup()).status, 'complete');
  assert.equal(runtime.getNativeAuthSnapshot().user, null);
});

test('repeated deletion cleanup shares one local operation and never sends DELETE', async () => {
  const { runtime, h } = await setup(); await runtime.startNativeAuth();
  const results = await Promise.all([runtime.completeDeletedAccountCleanup(), runtime.completeDeletedAccountCleanup()]);
  assert.ok(results.every(x => x.status === 'complete'));
  assert.equal(h.calls.auth, 1); assert.equal(h.calls.secure_storage, 1); assert.equal(h.calls.local_data, 1);
  assert.equal(h.networkRequests, 0);
});

test('a stale cleanup retry cannot clear a later normally authenticated B lifecycle', async () => {
  const { runtime, h } = await setup(); await runtime.startNativeAuth();
  assert.equal((await runtime.completeDeletedAccountCleanup()).status, 'complete');
  h.user = { id: 'SYNTHETIC_ACCOUNT_B' };
  await runtime.signInNative('kakao');
  await runtime.handleNativeAuthCallback('https://synthetic.invalid/auth/native/callback');
  assert.equal(runtime.getNativeAuthSnapshot().status, 'signed_in');
  assert.equal(runtime.getNativeAuthSnapshot().user.id, 'SYNTHETIC_ACCOUNT_B');
  const before = { ...h.calls };
  const result = await runtime.retryDeletedAccountCleanup();
  assert.equal(result.status, 'complete');
  assert.deepEqual({ ...h.calls }, before);
  assert.equal(runtime.getNativeAuthSnapshot().user.id, 'SYNTHETIC_ACCOUNT_B');
  assert.equal(runtime.getNativeAuthSnapshot().status, 'signed_in');
  assert.equal(h.networkRequests, 0);
});

for (const provider of ['google', 'kakao']) {
  test(`${provider} still starts normally after successful cleanup`, async () => {
    const { runtime, h } = await setup({ signedIn: false }); await runtime.startNativeAuth();
    await runtime.signInNative(provider); assert.deepEqual(h.providers, [provider]);
  });
}
