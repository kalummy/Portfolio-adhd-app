import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  DEV_SUPABASE,
  DEV_FIREBASE,
  sha256,
  validRegistration,
  allowedRoute,
} from "../lib/native-push/contracts.ts";
import { nativePushHandler } from "../lib/native-push/server.ts";
import { classifyFcm, createFcmSender } from "../lib/native-push/fcm.ts";
import { runNativeAwareReminders } from "../lib/native-push/scheduler.ts";
const fixture = {
  installationId: "11111111-1111-4111-8111-111111111111",
  bindingId: "22222222-2222-4222-8222-222222222222",
  secret: "a".repeat(64),
  revision: 1,
  token: "synthetic_token_for_tests_only",
  appVersion: "test",
  preferences: { medication: false, visit_day: false, mood: false },
};
const request = (path, body, auth = "Bearer synthetic") =>
  new Request(DEV_SUPABASE + "/functions/v1/native-push/" + path, {
    method: "POST",
    headers: { authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
function setup() {
  const calls = [];
  const db = {
    auth: {
      getUser: async (token) =>
        token === "synthetic"
          ? { data: { user: { id: "server-derived-owner" } }, error: null }
          : { data: { user: null }, error: {} },
    },
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: true, error: null };
    },
  };
  return {
    calls,
    handler: nativePushHandler(
      db,
      async () => {
        throw Error("unexpected_send");
      },
      DEV_SUPABASE,
    ),
  };
}
test("registration validates token, UUID, revision, and complete independent preferences", () => {
  assert.equal(validRegistration(fixture), true);
  for (const patch of [
    { revision: 0 },
    { token: "" },
    { preferences: { medication: true } },
    { bindingId: "bad" },
    { installationId: "bad" },
  ])
    assert.equal(validRegistration({ ...fixture, ...patch }), false);
});
test("server derives ownership from verified bearer and hashes capability", async () => {
  const s = setup();
  assert.equal((await s.handler(request("register", fixture))).status, 200);
  assert.equal(s.calls[0].args.p_user_id, "server-derived-owner");
  assert.equal(s.calls[0].args.p_secret_hash, await sha256(fixture.secret));
  assert.deepEqual(s.calls[0].args.p_preferences, fixture.preferences);
});
test("submitted owner rejected; absent/invalid bearer cannot register", async () => {
  for (const [body, token, status] of [
    [{ ...fixture, user_id: "attacker" }, "Bearer synthetic", 400],
    [fixture, "", 401],
    [fixture, "Bearer invalid", 401],
  ]) {
    const s = setup();
    assert.equal(
      (await s.handler(request("register", body, token))).status,
      status,
    );
    assert.equal(s.calls.length, 0);
  }
});
test("capability-only revoke has no owner/preference/send authority", async () => {
  const s = setup();
  const body = {
    installationId: fixture.installationId,
    secret: fixture.secret,
    revision: 2,
  };
  assert.equal((await s.handler(request("revoke", body, ""))).status, 200);
  assert.equal(s.calls[0].name, "revoke_native_push");
  assert.equal(
    (
      await s.handler(
        request("revoke", { ...body, preferences: fixture.preferences }, ""),
      )
    ).status,
    400,
  );
});
test("untrusted origin is denied, Native preflight narrowly scoped", async () => {
  const s = setup();
  for (const origin of [
    "https://evil.example",
    "https://addi-gamma.vercel.app",
  ])
    assert.equal(
      (
        await s.handler(
          new Request(DEV_SUPABASE, { method: "OPTIONS", headers: { origin } }),
        )
      ).status,
      403,
    );
  const r = await s.handler(
    new Request(DEV_SUPABASE, {
      method: "OPTIONS",
      headers: { origin: "https://localhost" },
    }),
  );
  assert.equal(r.status, 204);
  assert.equal(
    r.headers.get("Access-Control-Allow-Origin"),
    "https://localhost",
  );
});
test("Production server and credentials fail closed", () => {
  assert.throws(() =>
    nativePushHandler({}, () => {}, "https://production.supabase.co"),
  );
  assert.throws(() =>
    createFcmSender({
      project_id: "production",
      client_email: "invalid",
      private_key: "",
    }),
  );
});
test("tap routes allow only internal medication, mood and visit screens", () => {
  for (const route of ["/", "/moods/new", "/visits"])
    assert.equal(allowedRoute(route), true);
  for (const route of [
    "https://evil.example",
    "//evil.example",
    "/auth/callback",
    "/moods/new?x=1",
    null,
  ])
    assert.equal(allowedRoute(route), false);
});
test("FCM distinguishes explicit retry, invalid token and unknown outcomes", () => {
  assert.equal(classifyFcm(200, {}).status, "sent");
  for (const code of [429, 500, 503])
    assert.equal(classifyFcm(code, {}).status, "retryable_failed");
  assert.equal(
    classifyFcm(404, { error: { details: [{ errorCode: "UNREGISTERED" }] } })
      .code,
    "unregistered",
  );
  assert.equal(classifyFcm(401, {}).status, "permanent_failed");
});
test("sender uses Dev-only data message, bound installation and generic policy; timeout is terminal", async () => {
  const key = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  }).privateKey.export({ type: "pkcs8", format: "pem" });
  const calls = [];
  const credential = {
    project_id: DEV_FIREBASE,
    client_email: `test@${DEV_FIREBASE}.iam.gserviceaccount.com`,
    private_key: key,
  };
  const send = createFcmSender(credential, async (url, init) => {
    calls.push({ url, init });
    return url.includes("oauth2")
      ? Response.json({ access_token: "synthetic", expires_in: 3600 })
      : Response.json({ name: "accepted" });
  });
  assert.equal(
    (await send(fixture, "mood", "synthetic-delivery")).status,
    "sent",
  );
  const payload = JSON.parse(calls[1].init.body).message;
  assert.equal(payload.notification, undefined);
  assert.equal(payload.data.route, "/moods/new");
  assert.equal(payload.data.binding_id, fixture.bindingId);
  assert.equal(payload.android.ttl, "60s");
  assert.match(calls[1].url, /addi-503b5/);
  const failing = createFcmSender(credential, async (url) => {
    if (url.includes("oauth2"))
      return Response.json({ access_token: "synthetic", expires_in: 3600 });
    throw Error("unknown");
  });
  assert.equal(
    (await failing(fixture, "daily", "id")).code,
    "provider_outcome_unknown",
  );
});
test("Native-only candidate runner claims same policy and isolates target results", async () => {
  const calls = [],
    sent = [];
  const db = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === "claim_due_reminder_dispatches_v2")
        return {
          data: [
            {
              user_id: "owner",
              reminder_date: "2026-09-15",
              reminder_slot: "mood_1500",
              claim_token: "claim",
            },
          ],
        };
      if (name === "prepare_reminder_dispatch_v2")
        return {
          data: {
            kind: "mood",
            targets: [
              { transport: "fcm", targetId: "chosen", credentials: {} },
              { transport: "web", targetId: "web", credentials: {} },
            ],
          },
        };
      return { data: true };
    },
  };
  const result = await runNativeAwareReminders(
    db,
    {
      fcm: async (t) => {
        sent.push(t);
        return { status: "sent", http: null, code: null };
      },
      web: async () => {
        throw Error("Web must not send");
      },
    },
    {
      now: new Date("2026-09-15T06:00:00Z"),
      onlyUserId: "owner",
      allowTarget: (t) => t.targetId === "chosen",
    },
  );
  assert.equal(result.delivered, 1);
  assert.equal(sent.length, 1);
  assert.equal(calls[0].args.p_only_user_id, "owner");
  assert.equal(
    calls.filter((c) => c.name === "finish_reminder_target_v2").length,
    2,
  );
  assert.equal(calls.at(-1).name, "finalize_reminder_dispatch_v2");
});
