// lib/native-push/contracts.ts
var DEV_PROJECT = "ohobxicxchkaisxxswkk";
var DEV_SUPABASE = `https://${DEV_PROJECT}.supabase.co`;
var DEV_FIREBASE = "addi-503b5";
var NATIVE_PUSH_PATH = "/functions/v1/native-push";
var KINDS = ["medication", "visit_day", "mood"];
var DISABLED = {
  medication: false,
  visit_day: false,
  mood: false
};
var UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function isPreferences(value) {
  return !!value && typeof value === "object" && Object.keys(value).length === 3 && KINDS.every((k) => typeof value[k] === "boolean");
}
function allowedRoute(route) {
  return route === "/" || route === "/moods/new" || route === "/visits";
}
function validInstallation(v) {
  if (!v || typeof v !== "object") return false;
  const a = v;
  return UUID.test(a.installationId) && typeof a.secret === "string" && /^[a-f0-9]{64}$/.test(a.secret) && Number.isSafeInteger(a.revision) && a.revision > 0;
}
function validRegistration(v) {
  if (!validInstallation(v)) return false;
  const a = v;
  return UUID.test(a.bindingId) && typeof a.token === "string" && /^[A-Za-z0-9_:\-.]{20,4096}$/.test(a.token) && typeof a.appVersion === "string" && a.appVersion.length > 0 && a.appVersion.length <= 80 && isPreferences(a.preferences);
}
async function sha256(value) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
    ),
    (x) => x.toString(16).padStart(2, "0")
  ).join("");
}

// lib/reminders/policy.ts
var REMINDER_TIME_ZONE = "Asia/Seoul";
var REMINDER_WINDOW_MINUTES = 30;
var SLOT_STARTS = [
  { slotKey: "visit_day_before_0800", hour: 8, minute: 0 },
  { slotKey: "visit_day_today_0800", hour: 8, minute: 0 },
  { slotKey: "medication_0900", hour: 9, minute: 0 },
  { slotKey: "daily_1100", hour: 11, minute: 0 },
  { slotKey: "daily_1300", hour: 13, minute: 0 },
  { slotKey: "mood_1500", hour: 15, minute: 0 },
  { slotKey: "bedtime_2100", hour: 21, minute: 0 }
];
var CONTENT_BY_KIND = {
  visit_day_before: {
    title: "\uB0B4\uC6D0\uC77C \uC54C\uB9BC",
    body: "\uB0B4\uC77C\uC740 \uBCD1\uC6D0 \uBC29\uBB38\uC77C\uC774\uC5D0\uC694.",
    kind: "visit_day",
    route: "/visits"
  },
  visit_day_today: {
    title: "\uB0B4\uC6D0\uC77C \uC54C\uB9BC",
    body: "\uC624\uB298\uC740 \uBCD1\uC6D0 \uBC29\uBB38\uC77C\uC774\uC5D0\uC694.",
    kind: "visit_day",
    route: "/visits"
  },
  daily: {
    title: "\uBCF5\uC6A9 \uC54C\uB9BC",
    body: "\uC624\uB298\uC758 \uBCF5\uC6A9 \uC5EC\uBD80\uB97C \uD655\uC778\uD574\uBCF4\uC138\uC694.",
    kind: "medication",
    route: "/"
  },
  as_needed: {
    title: "\uBCF5\uC6A9 \uC54C\uB9BC",
    body: "\uC624\uB298 \uC911\uC694\uD55C \uC77C\uC815\uC774 \uC788\uB2E4\uBA74 \uBCF5\uC6A9 \uACC4\uD68D\uC744 \uD655\uC778\uD574\uBCF4\uC138\uC694.",
    kind: "medication",
    route: "/"
  },
  bedtime: {
    title: "\uBCF5\uC6A9 \uC54C\uB9BC",
    body: "\uC790\uAE30 \uC804 \uD3C9\uC18C \uBCF5\uC6A9 \uACC4\uD68D\uC744 \uD655\uC778\uD574\uBCF4\uC138\uC694.",
    kind: "medication",
    route: "/"
  },
  mood: {
    title: "\uAC10\uC815\uAE30\uB85D \uC54C\uB9BC",
    body: "\uC624\uB298\uC758 \uAC10\uC815\uC740 \uC5B4\uB5A0\uC168\uB098\uC694?",
    kind: "mood",
    route: "/moods/new"
  }
};
function seoulClock(instant) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REMINDER_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(instant);
  const part = (type) => parts.find((candidate) => candidate.type === type)?.value ?? "";
  return {
    localDate: `${part("year")}-${part("month")}-${part("day")}`,
    hour: Number(part("hour")),
    minute: Number(part("minute"))
  };
}
function kstInstant(localDate, hour, minute) {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return /* @__PURE__ */ new Date(`${localDate}T${hh}:${mm}:00+09:00`);
}
function getActiveReminderWindows(instant = /* @__PURE__ */ new Date()) {
  if (!Number.isFinite(instant.getTime())) return [];
  const clock = seoulClock(instant);
  const localMinute = clock.hour * 60 + clock.minute;
  return SLOT_STARTS.filter(({ hour, minute }) => {
    const startMinute = hour * 60 + minute;
    return localMinute >= startMinute && localMinute < startMinute + REMINDER_WINDOW_MINUTES;
  }).flatMap((definition) => {
    const windowStartedAt = kstInstant(clock.localDate, definition.hour, definition.minute);
    const windowExpiresAt = new Date(
      windowStartedAt.getTime() + REMINDER_WINDOW_MINUTES * 6e4
    );
    if (instant.getTime() < windowStartedAt.getTime() || instant.getTime() >= windowExpiresAt.getTime()) {
      return [];
    }
    return [{
      localDate: clock.localDate,
      slotKey: definition.slotKey,
      windowStartedAt: windowStartedAt.toISOString(),
      windowExpiresAt: windowExpiresAt.toISOString()
    }];
  });
}
function getReminderContent(kind) {
  return CONTENT_BY_KIND[kind];
}

// lib/native-push/server.ts
var json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  }
});
var exact = (value, keys) => Object.keys(value).every((k) => keys.includes(k));
var identityKeys = ["installationId", "secret", "revision"];
function nativePushHandler(db, send, configuredUrl) {
  if (configuredUrl !== DEV_SUPABASE) throw Error("dev_project_required");
  return async (req) => {
    const origin = req.headers.get("origin");
    if (origin && origin !== "https://localhost")
      return json({ error: "origin_denied" }, 403);
    const cors = (r) => {
      if (origin) r.headers.set("Access-Control-Allow-Origin", origin);
      r.headers.set("Vary", "Origin");
      return r;
    };
    if (req.method === "OPTIONS")
      return cors(
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Methods": "POST",
            "Access-Control-Allow-Headers": "authorization,content-type",
            "Access-Control-Max-Age": "600"
          }
        })
      );
    if (req.method !== "POST")
      return cors(json({ error: "method_denied" }, 405));
    try {
      const text = await req.text();
      if (text.length > 12e3)
        return cors(json({ error: "invalid_request" }, 400));
      const body = JSON.parse(text);
      const action = new URL(req.url).pathname.split("/").pop();
      if (!validInstallation(body))
        return cors(json({ error: "invalid_request" }, 400));
      const common = {
        p_installation_id: body.installationId,
        p_secret_hash: await sha256(body.secret),
        p_revision: body.revision
      };
      if (action === "revoke" || action === "rotate") {
        const allowed = action === "revoke" ? identityKeys : [...identityKeys, "bindingId", "token"];
        if (!exact(body, allowed) || action === "rotate" && (!UUID.test(body.bindingId) || typeof body.token !== "string" || !/^[A-Za-z0-9_:\-.]{20,4096}$/.test(body.token)))
          return cors(json({ error: "invalid_request" }, 400));
        const result = await db.rpc(
          action === "revoke" ? "revoke_native_push" : "rotate_native_push",
          action === "revoke" ? common : { ...common, p_binding_id: body.bindingId, p_token: body.token }
        );
        if (result.error || action === "revoke" && result.data !== true)
          return cors(json({ error: "maintenance_pending" }, 409));
        return cors(json({ ok: true }));
      }
      const auth = req.headers.get("authorization");
      if (!auth?.startsWith("Bearer "))
        return cors(json({ error: "authentication_required" }, 401));
      const { data, error } = await db.auth.getUser(auth.slice(7));
      if (error || !data.user || data.user.is_anonymous)
        return cors(json({ error: "authentication_required" }, 401));
      if (action === "register") {
        if (!validRegistration(body) || !exact(body, [
          ...identityKeys,
          "bindingId",
          "token",
          "appVersion",
          "preferences"
        ]))
          return cors(json({ error: "invalid_request" }, 400));
        const result = await db.rpc("register_native_push", {
          ...common,
          p_user_id: data.user.id,
          p_binding_id: body.bindingId,
          p_token: body.token,
          p_app_version: body.appVersion,
          p_preferences: body.preferences
        });
        if (result.error)
          return cors(json({ error: "registration_conflict" }, 409));
        return cors(json({ ok: true }));
      }
      if (action === "status" || action === "test") {
        if (!exact(
          body,
          action === "test" ? [...identityKeys, "requestId", "kind"] : identityKeys
        ))
          return cors(json({ error: "invalid_request" }, 400));
        const result = await db.from("native_push_registrations").select(
          "id,binding_id,fcm_token,medication_enabled,visit_day_enabled,mood_enabled,revoked_at"
        ).eq("installation_id", body.installationId).eq("installation_secret_hash", common.p_secret_hash).eq("user_id", data.user.id).maybeSingle();
        if (result.error) return cors(json({ error: "read_failed" }, 503));
        const row = result.data;
        if (action === "status")
          return cors(
            json({
              active: !!row && !row.revoked_at,
              preferences: row && !row.revoked_at ? {
                medication: row.medication_enabled,
                visit_day: row.visit_day_enabled,
                mood: row.mood_enabled
              } : DISABLED
            })
          );
        if (!row || row.revoked_at || !UUID.test(body.requestId) || !["daily", "mood", "visit_day_today"].includes(body.kind))
          return cors(json({ error: "test_not_available" }, 409));
        const kind = body.kind;
        const pref = getReminderContent(kind).kind + "_enabled";
        if (!row[pref])
          return cors(json({ error: "preference_disabled" }, 409));
        const claim = await db.rpc("claim_native_push_test", {
          p_id: body.requestId,
          p_registration: row.id,
          p_kind: kind
        });
        if (claim.error || claim.data !== true)
          return cors(json({ error: "test_not_allowed" }, 409));
        const outcome = await send(
          {
            token: row.fcm_token,
            installationId: body.installationId,
            bindingId: row.binding_id
          },
          kind,
          body.requestId
        );
        await db.from("native_push_test_runs").update({
          status: outcome.status === "sent" ? "sent" : outcome.code === "provider_outcome_unknown" ? "unknown" : "failed",
          completed_at: (/* @__PURE__ */ new Date()).toISOString(),
          error_code: outcome.code
        }).eq("id", body.requestId);
        if (outcome.code === "unregistered")
          await db.from("native_push_registrations").update({ revoked_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", row.id).eq("binding_id", row.binding_id).eq("fcm_token", row.fcm_token);
        return cors(
          json(
            { accepted: outcome.status === "sent" },
            outcome.status === "sent" ? 200 : 502
          )
        );
      }
      return cors(json({ error: "not_found" }, 404));
    } catch {
      return cors(json({ error: "request_failed" }, 400));
    }
  };
}

// lib/native-push/fcm.ts
function classifyFcm(status, body) {
  if (status >= 200 && status < 300)
    return { status: "sent", http: null, code: null };
  const error = body && typeof body === "object" ? body.error : null;
  if (status === 404 && error?.details?.some((x) => x.errorCode === "UNREGISTERED"))
    return { status: "permanent_failed", http: 404, code: "unregistered" };
  if (status === 429)
    return { status: "retryable_failed", http: status, code: "provider_429" };
  if (status >= 500 && status <= 599)
    return { status: "retryable_failed", http: status, code: "provider_5xx" };
  return { status: "permanent_failed", http: status, code: "provider_4xx" };
}
var b64 = (bytes) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join("")).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
var encoded = (v) => b64(new TextEncoder().encode(JSON.stringify(v)));
function createFcmSender(credential, fetcher = fetch) {
  if (credential.project_id !== DEV_FIREBASE || !credential.client_email.endsWith(
    `@${DEV_FIREBASE}.iam.gserviceaccount.com`
  ) || !credential.private_key.includes("BEGIN PRIVATE KEY"))
    throw Error("dev_fcm_credential_required");
  let access;
  async function bearer() {
    if (access && access.expires > Date.now() + 6e4) return access.token;
    const now = Math.floor(Date.now() / 1e3);
    const unsigned = encoded({ alg: "RS256", typ: "JWT" }) + "." + encoded({
      iss: credential.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600
    });
    const der = Uint8Array.from(
      atob(credential.private_key.replace(/-----[^-]+-----|\s/g, "")),
      (c) => c.charCodeAt(0)
    );
    const key = await crypto.subtle.importKey(
      "pkcs8",
      der,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const assertion = unsigned + "." + b64(
      new Uint8Array(
        await crypto.subtle.sign(
          "RSASSA-PKCS1-v1_5",
          key,
          new TextEncoder().encode(unsigned)
        )
      )
    );
    const response = await fetcher("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion
      }),
      signal: AbortSignal.timeout(1e4)
    });
    if (!response.ok) throw Error("fcm_credential_unavailable");
    const data = await response.json();
    if (!data.access_token) throw Error("fcm_credential_unavailable");
    access = {
      token: data.access_token,
      expires: Date.now() + data.expires_in * 1e3
    };
    return access.token;
  }
  return async (target, kind, deliveryId) => {
    let auth;
    try {
      auth = await bearer();
    } catch {
      return {
        status: "permanent_failed",
        http: null,
        code: "provider_outcome_unknown"
      };
    }
    const content = getReminderContent(kind);
    try {
      const response = await fetcher(
        `https://fcm.googleapis.com/v1/projects/${DEV_FIREBASE}/messages:send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${auth}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            message: {
              token: target.token,
              android: { priority: "HIGH", ttl: "60s" },
              data: {
                installation_id: target.installationId,
                binding_id: target.bindingId,
                delivery_id: deliveryId,
                kind: content.kind,
                route: content.route,
                title: content.title,
                body: content.body,
                expires_at: String(Date.now() + 6e4)
              }
            }
          }),
          signal: AbortSignal.timeout(1e4)
        }
      );
      return classifyFcm(
        response.status,
        await response.json().catch(() => null)
      );
    } catch {
      return {
        status: "permanent_failed",
        http: null,
        code: "provider_outcome_unknown"
      };
    }
  };
}

// lib/native-push/scheduler.ts
async function runNativeAwareReminders(db, transports, options) {
  let delivered = 0;
  let failed = 0;
  for (const window of getActiveReminderWindows(options.now)) {
    const claim = await db.rpc("claim_due_reminder_dispatches_v2", {
      p_reminder_date: window.localDate,
      p_reminder_slot: window.slotKey,
      p_now: options.now.toISOString(),
      p_window_expires_at: window.windowExpiresAt,
      p_batch_limit: 1,
      p_only_user_id: options.onlyUserId
    });
    if (claim.error) throw Error("reminder_claim_failed");
    for (const row of claim.data ?? []) {
      const args = {
        p_user_id: row.user_id,
        p_reminder_date: row.reminder_date,
        p_reminder_slot: row.reminder_slot,
        p_claim_token: row.claim_token,
        p_now: options.now.toISOString()
      };
      const prepared = await db.rpc("prepare_reminder_dispatch_v2", args);
      if (prepared.error) throw Error("reminder_prepare_failed");
      if (!prepared.data) continue;
      const { kind, targets } = prepared.data;
      for (const target of targets) {
        let result = {
          status: "cancelled",
          http: null,
          code: "target_disabled"
        };
        if (options.allowTarget(target)) {
          try {
            result = await transports[target.transport](
              target,
              kind,
              `${row.reminder_date}:${row.reminder_slot}:${target.targetId}`
            );
          } catch {
            result = {
              status: "permanent_failed",
              http: null,
              code: "provider_outcome_unknown"
            };
          }
        }
        const finish = await db.rpc("finish_reminder_target_v2", {
          p_user_id: row.user_id,
          p_date: row.reminder_date,
          p_slot: row.reminder_slot,
          p_claim: row.claim_token,
          p_transport: target.transport,
          p_target: target.targetId,
          p_outcome: result.status,
          p_http: result.http,
          p_error: result.code,
          p_now: options.now.toISOString()
        });
        if (finish.error || finish.data !== true)
          throw Error("reminder_delivery_save_failed");
        if (result.status === "sent") delivered++;
        else if (result.status !== "cancelled") failed++;
      }
      const finalized = await db.rpc("finalize_reminder_dispatch_v2", {
        p_user_id: row.user_id,
        p_date: row.reminder_date,
        p_slot: row.reminder_slot,
        p_claim: row.claim_token,
        p_now: options.now.toISOString()
      });
      if (finalized.error) throw Error("reminder_finalize_failed");
    }
  }
  return { delivered, failed };
}
export {
  DEV_FIREBASE,
  DEV_PROJECT,
  DEV_SUPABASE,
  DISABLED,
  KINDS,
  NATIVE_PUSH_PATH,
  UUID,
  allowedRoute,
  classifyFcm,
  createFcmSender,
  getReminderContent,
  isPreferences,
  nativePushHandler,
  runNativeAwareReminders,
  sha256,
  validInstallation,
  validRegistration
};
