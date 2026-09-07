import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { handlePushE2E, isPushE2EEnabled } from "../lib/push/e2e.ts";
import { isPublicRequestPath } from "../lib/auth/routes.ts";

const runId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
const subscriptionId = "30000000-0000-4000-8000-000000000001";
const endpoint = "https://push.invalid/synthetic-chrome";
const otherEndpoint = "https://push.invalid/synthetic-other";
const fingerprint = createHash("sha256").update(endpoint).digest("hex");
const now = Date.now();
let passed = 0;
let totalMockCalls = 0;
function request(body = { runId }, origin = "https://addi.invalid") {
  return new Request("https://addi.invalid/api/push/e2e", {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
function fixture(options = {}) {
  const run = { id: runId, user_id: userId, subscription_id: subscriptionId,
    subscription_fingerprint: fingerprint, status: "ready", consumed_at: null,
    expires_at: new Date(now + 600_000).toISOString(), ...options.run };
  const sub = { id: subscriptionId, user_id: userId, endpoint, p256dh: "synthetic-key-only", auth: "synthetic-auth",
    revoked_at: null, ...options.sub };
  const subscriptions = [sub, { ...sub, id: "other", endpoint: otherEndpoint }];
  const originalSubscriptions = structuredClone(subscriptions);
  const calls = [], results = [], access = [];
  const deps = {
    enabled: () => options.enabled ?? true,
    getUserId: async () => { access.push("auth"); return options.user === undefined ? userId : options.user; },
    assertConfigured: () => { access.push("config"); if (options.configError) throw new Error("secret"); },
    // A model for unit tests only. Actual Postgres locking is verified separately by the Dev DB fixtures.
    claim: async (id, owner) => {
      access.push("claim");
      if (options.claimError) throw new Error("secret");
      if (id !== run.id || owner !== run.user_id || run.status !== "ready" || Date.parse(run.expires_at) <= now
        || sub.id !== run.subscription_id || sub.user_id !== run.user_id || sub.revoked_at !== null
        || createHash("sha256").update(sub.endpoint).digest("hex") !== run.subscription_fingerprint) return null;
      run.status = "consumed";
      run.consumed_at = new Date(now).toISOString();
      const claimed = structuredClone({ ...run, subscription: sub });
      if (options.malformedClaim) claimed.subscription.id = "wrong";
      if (options.disableAfterClaim) options.enabled = false;
      if (options.ambiguousClaim) throw new Error("lost response after commit");
      return claimed;
    },
    finish: async (id, result) => {
      assert.equal(id, runId);
      if (options.finishError) throw new Error("secret");
      results.push(result); Object.assign(run, result);
    },
    send: async (target, payload) => {
      calls.push(structuredClone({ target, payload })); totalMockCalls++;
      assert.equal(run.status, "consumed");
      assert.equal(target.endpoint, endpoint);
      assert.deepEqual(payload, { notificationId: `push-e2e:${runId}`, title: "ADDI 알림 테스트",
        body: "알림이 정상적으로 도착했어요.", route: "/" });
      await Promise.resolve();
      if (options.error) throw options.error;
      return { statusCode: options.status ?? 201 };
    },
    now: () => options.clock ?? now,
  };
  return { run, deps, calls, results, access, verify() {
    assert.ok(calls.length <= 1);
    assert.equal(calls.filter(c => c.target.endpoint === otherEndpoint).length, 0);
    assert.deepEqual(subscriptions, originalSubscriptions);
    assert.ok(!JSON.stringify(results).includes("secret"));
    assert.ok(!JSON.stringify(results).includes("https://"));
  } };
}
async function test(name, options, expected, body = { runId }) {
  const f = fixture(options);
  const response = await handlePushE2E(request(body), f.deps);
  assert.equal(response.status, expected, name);
  assert.equal(f.calls.length, expected === 200 || options.error || options.status ? 1 : 0, name);
  f.verify(); passed++; console.log(`PASS ${name}`); return f;
}
await test("invalid runId", {}, 400, { runId: "invalid" });
await test("missing run", {}, 409, { runId: "10000000-0000-4000-8000-000000000002" });
for (const key of ["endpoint", "user_id", "subscription_id", "message"]) {
  await test(`reject extra ${key}`, {}, 400, { runId, [key]: "forbidden" });
}
await test("unauthenticated", { user: null }, 401);
await test("other logged user", { user: "other" }, 409);
await test("other subscription ID", { run: { subscription_id: "other" } }, 409);
await test("other subscription owner", { sub: { user_id: "other" } }, 409);
await test("fingerprint mismatch", { run: { subscription_fingerprint: "0".repeat(64) } }, 409);
await test("revoked", { sub: { revoked_at: new Date(now).toISOString() } }, 409);
await test("expired", { run: { expires_at: new Date(now - 1).toISOString() } }, 409);
await test("cancelled", { run: { status: "cancelled" } }, 409);
await test("failed", { run: { status: "failed" } }, 409);
const off = await test("kill switch false", { enabled: false }, 404);
assert.deepEqual(off.access, []);
for (const value of [undefined, "", "false", "TRUE", " true ", "1"]) assert.equal(isPushE2EEnabled(value), false);
assert.equal(isPushE2EEnabled("true"), true);
await test("configuration unavailable", { configError: true }, 503);
await test("claim unavailable", { claimError: true }, 503);
await test("defensive target recheck", { malformedClaim: true }, 502);
await test("expired between claim and send", { clock: now + 600_001 }, 502);
await test("disabled between claim and send", { disableAfterClaim: true }, 502);
const accepted = await test("mock 2xx", {}, 200);
assert.equal(accepted.run.provider_status, 201);
for (const code of [404, 410, 429, 500, 503]) {
  const f = await test(`mock ${code}`, { error: { statusCode: code, body: "secret", endpoint } }, 502);
  assert.equal(f.run.status, "failed"); assert.equal(f.run.provider_status, code);
  assert.equal((await handlePushE2E(request(), f.deps)).status, 409); f.verify();
}
for (const [name, error, code] of [["timeout", new Error("Socket timeout"), "provider_timeout"],
  ["network ambiguity", new Error("secret"), "provider_network_error"]]) {
  const f = await test(`mock ${name}`, { error }, 502);
  assert.equal(f.run.error_code, code);
  assert.equal((await handlePushE2E(request(), f.deps)).status, 409); f.verify();
}
for (const [name, options] of [["sequential", {}], ["lost result write", { finishError: true }],
  ["lost claim response", { ambiguousClaim: true }]]) {
  const f = fixture(options);
  await handlePushE2E(request(), f.deps);
  assert.equal((await handlePushE2E(request(), f.deps)).status, 409);
  assert.equal(f.calls.length, options.ambiguousClaim ? 0 : 1);
  f.verify(); passed++; console.log(`PASS ${name}`);
}
const parallel = fixture();
const responses = await Promise.all(Array.from({ length: 32 }, () => handlePushE2E(request(), parallel.deps)));
assert.equal(responses.filter(r => r.status === 200).length, 1);
assert.equal(responses.filter(r => r.status === 409).length, 31);
assert.equal(parallel.calls.length, 1); parallel.verify(); passed++;
console.log("PASS parallel 32: accepted=1 rejected=31 provider=1 other=0");
const crossOrigin = fixture();
assert.equal((await handlePushE2E(request({ runId }, "https://evil.invalid"), crossOrigin.deps)).status, 403);
assert.deepEqual(crossOrigin.access, []); passed++;
assert.equal(isPublicRequestPath("/api/push/e2e"), true);
assert.equal(isPublicRequestPath("/api/push/e2e/anything"), false);
// No real sender is imported by this test. Guard the route's narrow write boundary as well.
const route = readFileSync(new URL("../app/api/push/e2e/route.ts", import.meta.url), "utf8");
assert.deepEqual([...route.matchAll(/\.from\("([^"]+)"\)/g)].map(m => m[1]), ["push_e2e_runs"]);
assert.ok(!/reminder|app_notifications|revoke|\.insert\(|\.delete\(/.test(route));
assert.ok(route.includes("send: sendWebPush"));
console.log(`PASS ${passed} cases; total mock calls=${totalMockCalls}; real provider=0; other endpoints=0; subscription/app_notifications/reminder_dispatches writes=0`);
