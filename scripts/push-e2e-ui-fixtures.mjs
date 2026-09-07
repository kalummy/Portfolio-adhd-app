import assert from "node:assert/strict";
import { getE2EOffer, E2E_CHROME_FINGERPRINT, endpointFingerprint } from "../lib/push/e2e-offer.ts";
import { createE2EClick } from "../lib/push/e2e-click.ts";

const now = Date.now();
const hash = `${E2E_CHROME_FINGERPRINT}${"a".repeat(48)}`;
const run = { id: "10000000-0000-4000-8000-000000000001", user_id: "owner", subscription_id: "chrome",
  subscription_fingerprint: hash, status: "ready", created_at: new Date(now - 1000).toISOString(),
  expires_at: new Date(now + 599_000).toISOString() };
const target = { id: "chrome", user_id: "owner", endpoint: "https://push.invalid/chrome", revoked_at: null };
const other = { ...target, id: "samsung", endpoint: "https://push.invalid/samsung" };
let passed = 0;
function fixture(options = {}) {
  const access = [];
  const deps = {
    enabled: () => options.enabled ?? "true", scheduler: () => options.scheduler ?? "false",
    getUserId: async () => { access.push("auth"); return options.user === undefined ? "owner" : options.user; },
    getRuns: async () => { access.push("runs"); if (options.error) throw new Error("private"); return options.runs ?? [{ ...run, ...options.run }]; },
    getTargets: async () => { access.push("targets"); const rows = options.rows ?? [{ ...target, ...options.target }, other];
      return { rows, count: options.count === undefined ? rows.length : options.count }; },
    now: () => now,
    fingerprint: (endpoint) => endpoint === target.endpoint || (options.collision && endpoint === other.endpoint) ? hash : "b".repeat(64),
  };
  return { deps, access };
}
async function hidden(name, options) {
  const f = fixture(options);
  assert.equal(await getE2EOffer(f.deps), null, name);
  passed++; console.log(`PASS ${name}`); return f;
}
const valid = fixture();
assert.deepEqual(await getE2EOffer(valid.deps), { runId: run.id, expiresAt: run.expires_at }); passed++;
assert.equal(endpointFingerprint("synthetic").length, 64);
for (const enabled of ["false", "", "TRUE", " true "]) {
  const f = await hidden(`disabled ${JSON.stringify(enabled)} has zero auth/DB access`, { enabled });
  assert.deepEqual(f.access, []);
}
for (const scheduler of ["true", ""]) await hidden(`scheduler not explicitly OFF ${scheduler}`, { scheduler });
await hidden("unauthenticated", { user: null });
await hidden("different logged-in owner", { user: "other-user" });
await hidden("no run", { runs: [] });
await hidden("ambiguous runs", { runs: [run, run] });
for (const status of ["consumed", "failed", "cancelled", "expired"]) await hidden(status, { run: { status } });
await hidden("expired ready run", { run: { expires_at: new Date(now).toISOString() } });
await hidden("invalid expiry", { run: { expires_at: "invalid" } });
await hidden("expiry longer than ten minutes", { run: { expires_at: new Date(now + 600_000).toISOString() } });
await hidden("future creation", { run: { created_at: new Date(now + 1000).toISOString() } });
await hidden("wrong target fingerprint", { run: { subscription_fingerprint: "b".repeat(64) } });
await hidden("full fingerprint mismatch", { run: { subscription_fingerprint: hash.slice(0, -1) + "b" } });
await hidden("wrong subscription ID", { target: { id: "wrong" } });
await hidden("wrong subscription owner", { target: { user_id: "other-user" } });
await hidden("revoked target", { target: { revoked_at: new Date(now).toISOString() } });
await hidden("no fingerprint match never falls back", { rows: [other] });
await hidden("global duplicate fingerprint", { collision: true });
await hidden("truncated global query", { count: 1001 });
await hidden("missing exact global count", { count: null });
await hidden("DB error hides button", { error: true });
const race = fixture(); let checks = 0;
race.deps.enabled = () => ++checks === 1 ? "true" : "false";
assert.equal(await getE2EOffer(race.deps), null); passed++;

function clickFixture(mode = "accepted") {
  const values = new Map(); const calls = [];
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const deps = { runId: run.id, expiresAt: run.expires_at, now: () => now, storage,
    fetch: async (url, init) => {
      calls.push({ url, init });
      assert.equal(values.size, 1, "attempt persisted before request");
      assert.equal(url, "/api/push/e2e");
      assert.deepEqual(JSON.parse(init.body), { runId: run.id });
      assert.equal(init.credentials, "same-origin"); assert.equal(init.redirect, "error");
      await Promise.resolve();
      if (mode === "timeout") throw new DOMException("synthetic", "TimeoutError");
      if (mode === "network") throw new Error("synthetic");
      if (mode === "invalid-json") return new Response("bad json");
      return Response.json({ code: mode === "accepted" ? "provider_accepted" : "run_unavailable" },
        { status: mode === "accepted" ? 200 : Number(mode) });
    } };
  return { deps, calls };
}
for (const mode of ["accepted", "404", "409", "429", "500", "timeout", "network", "invalid-json"]) {
  const f = clickFixture(mode); const click = createE2EClick(f.deps);
  const results = await Promise.all([click(), click(), click()]);
  assert.equal(results[0], mode === "accepted" ? "accepted" : ["timeout", "network", "invalid-json"].includes(mode) ? "unknown" : "failed");
  assert.equal(await click(), "blocked");
  assert.equal(await createE2EClick(f.deps)(), "blocked", "remount/reload attempt blocked");
  assert.equal(f.calls.length, 1); passed++; console.log(`PASS click ${mode}: parallel, sequential, remount => one request`);
}
const expired = clickFixture(); expired.deps.expiresAt = new Date(now).toISOString();
assert.equal(await createE2EClick(expired.deps)(), "blocked"); assert.equal(expired.calls.length, 0); passed++;
const blockedStorage = clickFixture(); blockedStorage.deps.storage.setItem = () => { throw new Error("blocked"); };
assert.equal(await createE2EClick(blockedStorage.deps)(), "blocked"); assert.equal(blockedStorage.calls.length, 0); passed++;
console.log(`PASS ${passed} UI eligibility/click cases; real HTTP/provider calls=0; DB writes=0`);
