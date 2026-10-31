import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("../apps/native/node_modules/typescript/lib/typescript.js");
const root = path.resolve(import.meta.dirname, "..");
const results = [];

function handler(file, name) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(found, `${name} must remain a real component handler`);
  return ts.transpileModule(found.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}

function authEffect(index = 0) {
  const file = "components/auth-login-screen.tsx";
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const callbacks = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "useEffect") callbacks.push(node.arguments[0]);
    ts.forEachChild(node, visit);
  }
  visit(source);
  const callback = callbacks[index];
  assert.ok(callback, "Auth check effect must remain connected to the component");
  return ts.transpileModule(`globalThis.__effect = ${callback.getText(source)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}

function setup(kind, options = {}) {
  const state = {
    busy: false, deleting: false, deleted: false, serverDeleted: false,
    cleanupPending: options.coldPending ?? false, recoveryComplete: false,
    error: "", deleteDialogOpen: true,
  };
  const refs = {
    operationInFlight: { current: false },
    serverDeletedRef: { current: false },
    recoveryCompleteRef: { current: false },
  };
  const calls = { fetch: 0, complete: 0, retry: 0, oldLocal: 0, oldSession: 0, routes: [] };
  const result = { status: "pending", failedSteps: ["local_data"] };
  let recoveryHint = options.coldPending || options.recoveryHint || false;
  let firstRequestResolve;
  const network = async () => {
    calls.fetch++;
    if (options.networkThrows) throw new Error("SYNTHETIC_NETWORK_FAILURE");
    if (options.deferRequest) return new Promise((resolve) => { firstRequestResolve = resolve; });
    return { ok: options.serverOk !== false };
  };
  const context = vm.createContext({
    console, Promise, Error,
    fetch: network,
    completeDeletedAccountCleanup: async () => {
      calls.complete++;
      if (options.cleanupThrows) throw new Error("SYNTHETIC_CLEANUP_FAILURE");
      return options.completeResult ?? result;
    },
    retryDeletedAccountCleanup: async () => {
      calls.retry++;
      if (options.retryThrows) throw new Error("SYNTHETIC_RETRY_FAILURE");
      const next = options.retryResult ?? { status: "complete", failedSteps: [] };
      if (next.status === "complete") recoveryHint = false;
      return next;
    },
    getPendingDeletedAccountCleanup: () => recoveryHint,
    // Legacy boundaries make the pre-fix failure observable without a real service.
    clearDeletedAccountLocalData: async () => {
      calls.oldLocal++;
      if (!options.legacyCleanupSucceeds) throw new Error("SYNTHETIC_LOCAL_FAILURE");
    },
    clearDeletedAccountSession: async () => {
      calls.oldSession++;
      if (!options.legacyCleanupSucceeds) throw new Error("SYNTHETIC_SESSION_FAILURE");
    },
    router: { replace: (value) => calls.routes.push(value), refresh: () => calls.routes.push("refresh") },
    operationInFlight: refs.operationInFlight,
    serverDeletedRef: refs.serverDeletedRef,
    recoveryCompleteRef: refs.recoveryCompleteRef,
    setBusy: (value) => { state.busy = value; },
    setDeleting: (value) => { state.deleting = value; },
    setDeleted: (value) => { state.deleted = value; },
    setServerDeleted: (value) => { state.serverDeleted = value; },
    setCleanupPending: (value) => { state.cleanupPending = value; },
    setRecoveryComplete: (value) => { state.recoveryComplete = value; },
    setError: (value) => { state.error = value; },
    setDeleteDialogOpen: (value) => { state.deleteDialogOpen = value; },
  });
  const file = kind === "public"
    ? "components/public-account-deletion.tsx" : "components/my-home-delete-account.tsx";
  const name = kind === "public" ? "handleDeleteAccount" : "handleDeleteRequest";
  const code = handler(file, name);
  function render() {
    Object.assign(context, {
      busy: state.busy, deleting: state.deleting, deleted: state.deleted,
      cleanupPending: state.cleanupPending, serverDeleted: state.serverDeleted,
      isAuthenticated: options.isAuthenticated !== false,
      canSubmit: options.canSubmit === false ? false : !state.busy,
    });
    // Snapshot primitives as a real React render does; refs remain stable across renders.
    return vm.runInContext(`(() => {
      const {busy,deleting,deleted,cleanupPending,serverDeleted,isAuthenticated,canSubmit}=globalThis;
      ${code}
      return ${name};
    })()`, context);
  }
  return {
    state, refs, calls, render,
    resolveRequest: () => { assert.equal(typeof firstRequestResolve, "function"); firstRequestResolve({ ok: true }); },
  };
}

async function check(id, run) {
  try { await run(); results.push({ id, status: "PASS" }); }
  catch (error) {
    results.push({ id, status: "FAIL", assertion: String(error.message).split("\n")[0] });
  }
}

for (const kind of ["public", "my-home"]) {
  await check(`${kind}: server success + local pending is not complete`, async () => {
    const f = setup(kind); await f.render()();
    assert.equal(f.calls.fetch, 1);
    assert.equal(f.state.cleanupPending, true);
    assert.equal(f.state.deleted, false);
    assert.equal(f.calls.routes.length, 0);
    assert.equal(f.refs.serverDeletedRef.current, true);
    assert.ok(f.state.error);
  });
  await check(`${kind}: retry is local-only after confirmed server deletion`, async () => {
    const f = setup(kind); await f.render()(); await f.render()();
    assert.equal(f.calls.fetch, 1);
    assert.equal(f.calls.complete, 1);
    assert.equal(f.calls.retry, 1);
    assert.equal(f.state.cleanupPending, false);
    if (kind === "public") assert.equal(f.state.deleted, true);
    else assert.ok(f.calls.routes.includes("/auth/login"));
  });
  await check(`${kind}: thrown local cleanup keeps confirmed server result`, async () => {
    const f = setup(kind, { cleanupThrows: true }); await f.render()();
    assert.equal(f.refs.serverDeletedRef.current, true);
    assert.equal(f.state.cleanupPending, true);
    assert.equal(f.state.deleted, false);
    assert.equal(f.calls.routes.length, 0);
    await f.render()(); assert.equal(f.calls.fetch, 1);
  });
  await check(`${kind}: server failure does not start local deletion`, async () => {
    const f = setup(kind, { serverOk: false }); await f.render()();
    assert.equal(f.calls.fetch, 1);
    assert.equal(f.calls.complete, 0); assert.equal(f.calls.retry, 0);
    assert.equal(f.refs.serverDeletedRef.current, false);
    assert.equal(f.state.deleted, false); assert.ok(f.state.error);
    assert.equal(f.calls.routes.length, 0);
  });
  await check(`${kind}: network failure never confirms server deletion`, async () => {
    const f = setup(kind, { networkThrows: true }); await f.render()();
    assert.equal(f.refs.serverDeletedRef.current, false);
    assert.equal(f.calls.complete, 0); assert.equal(f.state.deleted, false);
    assert.equal(f.state.cleanupPending, false);
  });
  await check(`${kind}: same-render rapid activation sends only one DELETE`, async () => {
    const f = setup(kind, { deferRequest: true, completeResult: { status: "complete", failedSteps: [] } });
    const click = f.render(); const first = click(); const second = click();
    assert.equal(f.calls.fetch, 1);
    f.resolveRequest(); await Promise.all([first, second]);
    assert.equal(f.calls.complete, 1);
  });
  await check(`${kind}: normal success retains the existing destination`, async () => {
    const f = setup(kind, { completeResult: { status: "complete", failedSteps: [] }, legacyCleanupSucceeds: true });
    await f.render()();
    assert.equal(f.calls.fetch, 1); assert.equal(f.state.cleanupPending, false);
    if (kind === "public") assert.equal(f.state.deleted, true);
    else assert.ok(f.calls.routes.includes("/auth/login"));
  });
  await check(`${kind}: cold recovery is local-only and cannot prove server deletion`, async () => {
    const f = setup(kind, { coldPending: true, isAuthenticated: false }); await f.render()();
    assert.equal(f.calls.fetch, 0); assert.equal(f.calls.retry, 1);
    assert.equal(f.refs.serverDeletedRef.current, false); assert.equal(f.state.deleted, false);
  });
  await check(`${kind}: cold hint before the effect never sends DELETE`, async () => {
    const f = setup(kind, { recoveryHint: true, canSubmit: kind === "public" });
    await f.render()();
    assert.equal(f.calls.fetch, 0); assert.equal(f.calls.retry, 1);
    assert.equal(f.refs.serverDeletedRef.current, false); assert.equal(f.state.deleted, false);
  });
  await check(`${kind}: cold recovery completion blocks stale authenticated deletion`, async () => {
    const f = setup(kind, { coldPending: true, isAuthenticated: true });
    await f.render()(); await f.render()();
    assert.equal(f.calls.fetch, 0); assert.equal(f.calls.retry, 1);
    assert.equal(f.refs.serverDeletedRef.current, false); assert.equal(f.state.deleted, false);
  });
  await check(`${kind}: pre-effect local retry rejection remains local pending`, async () => {
    const f = setup(kind, { recoveryHint: true, retryThrows: true, canSubmit: kind === "public" });
    await f.render()();
    assert.equal(f.calls.fetch, 0); assert.equal(f.calls.retry, 1);
    assert.equal(f.state.cleanupPending, true);
    assert.equal(f.refs.serverDeletedRef.current, false); assert.equal(f.state.deleted, false);
    assert.ok(f.state.error.includes("기기의 정보 정리"));
  });
}

for (const provider of ["google", "kakao"]) {
  for (const cleanupPending of [false, true]) {
    await check(`public: ${provider} login ${cleanupPending ? "waits for cleanup" : "keeps normal callback"}`, async () => {
      const calls = [];
      const context = vm.createContext({
        configured: true, busyProvider: null, deleting: false, cleanupPending, deleted: false,
        DELETE_ACCOUNT_PATH: "/delete-account",
        setBusyProvider: (value) => calls.push(["busy", value]), setError: () => {},
        trackLoginStarted: () => calls.push(["analytics"]),
        signInWithGoogle: async (next) => calls.push(["google", next]),
        signInWithKakao: async (next) => calls.push(["kakao", next]),
      });
      const code = handler("components/public-account-deletion.tsx", "handleSignIn");
      const signIn = vm.runInContext(`(() => {${code};return handleSignIn})()`, context);
      await signIn(provider);
      if (cleanupPending) assert.equal(calls.length, 0);
      else assert.deepEqual(calls, [["busy", provider], ["analytics"], [provider, "/delete-account"]]);
    });
  }
}

for (const provider of ["google", "kakao"]) {
  await check(`auth login: ${provider} cold recovery is actionable before OAuth`, async () => {
    const calls = { provider: 0, analytics: 0 };
    const state = { cleanupPending: false, error: "", authChecked: false };
    const context = vm.createContext({
      configured: true, busyProvider: null, cleanupBusy: false,
      cleanupInFlight: { current: false }, authCheckGeneration: { current: 0 },
      nextPath: "/", EMPTY_AUTH_STATE: { isAuthenticated: false, user: null },
      getPendingDeletedAccountCleanup: () => true,
      setCleanupPending: (value) => { state.cleanupPending = value; },
      setAuthState: () => {}, setAuthChecked: (value) => { state.authChecked = value; },
      setError: (value) => { state.error = value; }, setBusyProvider: () => {},
      trackLoginStarted: () => { calls.analytics++; },
      signInWithGoogle: async () => { calls.provider++; throw new Error("account_cleanup_pending"); },
      signInWithKakao: async () => { calls.provider++; throw new Error("account_cleanup_pending"); },
    });
    const code = handler("components/auth-login-screen.tsx", "handleSignIn");
    await vm.runInContext(`(() => {${code};return handleSignIn})()`, context)(provider);
    assert.equal(calls.provider, 0); assert.equal(calls.analytics, 0);
    assert.equal(state.cleanupPending, true); assert.equal(state.authChecked, true);
  });
  await check(`auth login: ${provider} normal callback is unchanged`, async () => {
    const calls = [];
    const context = vm.createContext({
      configured: true, busyProvider: null, cleanupBusy: false,
      cleanupInFlight: { current: false }, authCheckGeneration: { current: 0 }, nextPath: "/",
      getPendingDeletedAccountCleanup: () => false,
      setBusyProvider: (value) => calls.push(["busy", value]), setError: () => {},
      trackLoginStarted: () => calls.push(["analytics"]),
      signInWithGoogle: async (next) => calls.push(["google", next]),
      signInWithKakao: async (next) => calls.push(["kakao", next]),
    });
    const code = handler("components/auth-login-screen.tsx", "handleSignIn");
    await vm.runInContext(`(() => {${code};return handleSignIn})()`, context)(provider);
    assert.deepEqual(calls, [["busy", provider], ["analytics"], [provider, "/"]]);
  });
}

for (const [label, result, hintRemains, throws, expectedPending] of [
  ["completed", "complete", false, false, false],
  ["still pending", "pending", false, false, true],
  ["complete result but recovery hint remains", "complete", true, false, true],
  ["rejected", "pending", true, true, true],
]) {
  await check(`auth login: local-only retry ${label}`, async () => {
    const state = { pending: true, busy: false, authChecked: false, error: "", auth: null };
    const ref = { current: false }; let retryCalls = 0;
    const context = vm.createContext({
      cleanupInFlight: ref, authCheckGeneration: { current: 0 }, busyProvider: null,
      EMPTY_AUTH_STATE: { isAuthenticated: false, user: null },
      setCleanupBusy: (value) => { state.busy = value; },
      setAuthState: (value) => { state.auth = value; },
      setAuthChecked: (value) => { state.authChecked = value; },
      setCleanupPending: (value) => { state.pending = value; },
      setError: (value) => { state.error = value; },
      getPendingDeletedAccountCleanup: () => hintRemains,
      retryDeletedAccountCleanup: async () => {
        retryCalls++;
        if (throws) throw new Error("SYNTHETIC_LOCAL_RETRY_FAILURE");
        return { status: result, failedSteps: result === "pending" ? ["local_data"] : [] };
      },
    });
    const code = handler("components/auth-login-screen.tsx", "handleCleanupRetry");
    await vm.runInContext(`(() => {${code};return handleCleanupRetry})()`, context)();
    assert.equal(retryCalls, 1); assert.equal(state.pending, expectedPending);
    assert.equal(state.busy, false); assert.equal(ref.current, false);
    assert.equal(state.authChecked, true); assert.equal(state.auth.isAuthenticated, false);
    assert.equal(Boolean(state.error), expectedPending);
  });
}

await check("auth login: same-render local retry is serialized", async () => {
  const ref = { current: false }; let retryCalls = 0, resolve;
  const context = vm.createContext({
    cleanupInFlight: ref, authCheckGeneration: { current: 0 }, busyProvider: null,
    EMPTY_AUTH_STATE: { isAuthenticated: false, user: null },
    setCleanupBusy: () => {}, setAuthState: () => {}, setAuthChecked: () => {},
    setCleanupPending: () => {}, setError: () => {},
    getPendingDeletedAccountCleanup: () => false,
    retryDeletedAccountCleanup: () => { retryCalls++; return new Promise((done) => { resolve = done; }); },
  });
  const code = handler("components/auth-login-screen.tsx", "handleCleanupRetry");
  const retry = vm.runInContext(`(() => {${code};return handleCleanupRetry})()`, context);
  const first = retry(); const second = retry(); assert.equal(retryCalls, 1);
  resolve({ status: "complete", failedSteps: [] }); await Promise.all([first, second]);
});

await check("auth login: cold recovery avoids stale authenticated splash lookup", async () => {
  const state = { pending: false, authChecked: false, auth: null }; let authCalls = 0;
  const context = vm.createContext({
    configured: true, authCheckGeneration: { current: 0 },
    EMPTY_AUTH_STATE: { isAuthenticated: false, user: null },
    getPendingDeletedAccountCleanup: () => true,
    setCleanupPending: (value) => { state.pending = value; },
    setAuthState: (value) => { state.auth = value; },
    setAuthChecked: (value) => { state.authChecked = value; }, setError: () => {},
    getAuthState: async () => { authCalls++; return { isAuthenticated: true, user: { id: "SYNTHETIC_OLD" } }; },
  });
  vm.runInContext(authEffect(), context); context.__effect();
  assert.equal(authCalls, 0); assert.equal(state.pending, true);
  assert.equal(state.authChecked, true); assert.equal(state.auth.isAuthenticated, false);
});

await check("auth login: pre-retry Auth response cannot restore an old authenticated state", async () => {
  const state = { auth: null }; const generation = { current: 0 }; let resolve;
  const context = vm.createContext({
    configured: true, authCheckGeneration: generation,
    cleanupInFlight: { current: false }, busyProvider: null,
    EMPTY_AUTH_STATE: { isAuthenticated: false, user: null },
    getPendingDeletedAccountCleanup: () => false,
    setCleanupPending: () => {}, setAuthChecked: () => {}, setError: () => {}, setCleanupBusy: () => {},
    setAuthState: (value) => { state.auth = value; },
    getAuthState: () => new Promise((done) => { resolve = done; }),
    retryDeletedAccountCleanup: async () => ({ status: "complete", failedSteps: [] }),
  });
  vm.runInContext(authEffect(), context); context.__effect();
  const code = handler("components/auth-login-screen.tsx", "handleCleanupRetry");
  await vm.runInContext(`(() => {${code};return handleCleanupRetry})()`, context)();
  resolve({ isAuthenticated: true, user: { id: "SYNTHETIC_OLD" } });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(state.auth.isAuthenticated, false);
});

await check("auth login: cleanup appearing during splash becomes an actionable recovery state", async () => {
  const state = { pending: false, authChecked: false, auth: null }; const routes = [];
  const context = vm.createContext({
    cleanupPending: false, cleanupBusy: false, splashComplete: true, authChecked: true,
    authState: { isAuthenticated: true, user: { id: "SYNTHETIC_OLD" } },
    authCheckGeneration: { current: 0 }, EMPTY_AUTH_STATE: { isAuthenticated: false, user: null },
    nextPath: "/", getPendingDeletedAccountCleanup: () => true,
    setCleanupPending: (value) => { state.pending = value; },
    setAuthState: (value) => { state.auth = value; },
    setAuthChecked: (value) => { state.authChecked = value; },
    router: { replace: (value) => routes.push(value), refresh: () => routes.push("refresh") },
  });
  vm.runInContext(authEffect(2), context); context.__effect();
  assert.equal(routes.length, 0); assert.equal(state.pending, true);
  assert.equal(state.authChecked, true); assert.equal(state.auth.isAuthenticated, false);
});

console.log(JSON.stringify({
  observedAtKST: new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }) + " KST",
  scope: "ACTUAL_COMPONENT_HANDLERS_EFFECT_WITH_MOCK_FETCH_AUTH_COORDINATOR_REACT_SETTERS_ROUTER",
  realAccountOrNetworkAccess: false,
  renderedBrowserUI: false,
  cases: results,
  passed: results.filter((x) => x.status === "PASS").length,
  failed: results.filter((x) => x.status === "FAIL").length,
}, null, 2));
if (results.some((x) => x.status === "FAIL")) process.exitCode = 1;
