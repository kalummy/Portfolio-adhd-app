import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import {
  nativePushHandler,
  createFcmSender,
  runNativeAwareReminders,
  DEV_FIREBASE,
  nativeStage,
  assertNativeProject,
  UUID,
  getReminderContent,
} from "./bundle.js";
const url = Deno.env.get("SUPABASE_URL");
const stage = "production";
const expectedUrl = assertNativeProject(stage, url);
const configuredFirebaseProject = Deno.env.get("ADDI_NATIVE_FIREBASE_PROJECT_ID");
if (configuredFirebaseProject && configuredFirebaseProject !== "addi-503b5")
  throw Error("native_firebase_project_mismatch");
const firebaseProject = "addi-503b5";
const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const productionCredential = Deno.env.get("ADDI_PROD_FCM_CREDENTIAL");
const send = productionCredential
  ? createFcmSender(JSON.parse(productionCredential), fetch, firebaseProject)
  : async () => { throw Error("production_fcm_not_configured"); };
const handler = nativePushHandler(db, send, url, expectedUrl);
async function sendClaimedReminder(req) {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey || req.headers.get("authorization") !== `Bearer ${serviceRoleKey}`)
    return new Response(null, { status: 403 });
  if (req.method !== "POST") return new Response(null, { status: 405 });
  try {
    const text = await req.text();
    if (text.length > 1024) return new Response(null, { status: 400 });
    const body = JSON.parse(text);
    const keys = ["userId", "date", "slot", "claimToken", "targetId", "kind"];
    if (!body || typeof body !== "object" || Object.keys(body).length !== keys.length
      || keys.some((key) => !(key in body))
      || !UUID.test(body.userId) || !UUID.test(body.claimToken) || !UUID.test(body.targetId)
      || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)
      || !["visit_day_before_0800", "visit_day_today_0800", "medication_0900",
        "daily_1100", "daily_1300", "mood_1500", "bedtime_2100"].includes(body.slot)
      || !["visit_day_before", "visit_day_today", "daily", "as_needed", "bedtime", "mood"].includes(body.kind))
      return new Response(null, { status: 400 });
    const { data: dispatch, error: dispatchError } = await db.from("reminder_dispatches")
      .select("delivery_kind,status,claim_token,window_expires_at")
      .eq("user_id", body.userId).eq("reminder_date", body.date)
      .eq("reminder_slot", body.slot).maybeSingle();
    if (dispatchError || !dispatch || dispatch.status !== "processing"
      || dispatch.claim_token !== body.claimToken || dispatch.delivery_kind !== body.kind
      || Date.parse(dispatch.window_expires_at) <= Date.now())
      return new Response(null, { status: 409 });
    const { data: delivery, error: deliveryError } = await db.from("reminder_deliveries")
      .select("status,claim_token,binding_id,token_hash")
      .eq("user_id", body.userId).eq("reminder_date", body.date)
      .eq("reminder_slot", body.slot).eq("transport", "fcm")
      .eq("target_id", body.targetId).maybeSingle();
    if (deliveryError || !delivery || delivery.status !== "processing"
      || delivery.claim_token !== body.claimToken)
      return new Response(null, { status: 409 });
    const { data: registration, error: registrationError } = await db.from("native_push_registrations")
      .select("installation_id,binding_id,fcm_token,token_hash")
      .eq("id", body.targetId).eq("user_id", body.userId)
      .is("revoked_at", null).maybeSingle();
    if (registrationError || !registration || registration.binding_id !== delivery.binding_id
      || registration.token_hash !== delivery.token_hash)
      return new Response(null, { status: 409 });
    const result = await send({
      token: registration.fcm_token,
      installationId: registration.installation_id,
      bindingId: registration.binding_id,
    }, body.kind, `${body.date}:${body.slot}:${body.targetId}`);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return new Response(null, { status: 503 });
  }
}

Deno.serve(async (req) => {
  const pathname = new URL(req.url).pathname;
  if (stage === "production" && (/\/(test|test-admin|scheduler)$/.test(pathname)))
    return new Response(null, { status: 404 });
  if (pathname.endsWith("/scheduler-send"))
    return sendClaimedReminder(req);
  // A manual Dev send is limited to the selected, unexpired singleton Galaxy installation.
  if (new URL(req.url).pathname.endsWith("/test-admin")) {
    const secret = Deno.env.get("ADDI_DEV_PUSH_QA_SECRET");
    if (
      !secret ||
      req.method !== "POST" ||
      req.headers.get("authorization") !== `Bearer ${secret}`
    )
      return new Response(null, { status: 403 });
    try {
      const body = await req.json();
      if (
        Object.keys(body).some((k) => !["kind", "requestId"].includes(k)) ||
        !["daily", "mood", "visit_day_today"].includes(body.kind) ||
        !UUID.test(body.requestId)
      )
        return new Response(null, { status: 400 });
      const { data: target } = await db
        .from("native_push_qa_target")
        .select("registration_id,expires_at")
        .eq("singleton", true)
        .maybeSingle();
      if (!target || Date.parse(target.expires_at) <= Date.now())
        return new Response(null, { status: 409 });
      const { data: r } = await db
        .from("native_push_registrations")
        .select(
          "id,installation_id,binding_id,fcm_token,medication_enabled,mood_enabled,visit_day_enabled",
        )
        .eq("id", target.registration_id)
        .is("revoked_at", null)
        .maybeSingle();
      const pref = getReminderContent(body.kind).kind + "_enabled";
      if (!r || !r[pref]) return new Response(null, { status: 409 });
      const claim = await db.rpc("claim_native_push_test", {
        p_id: body.requestId,
        p_registration: r.id,
        p_kind: body.kind,
      });
      if (claim.error || claim.data !== true)
        return new Response(null, { status: 409 });
      const result = await send(
        {
          token: r.fcm_token,
          installationId: r.installation_id,
          bindingId: r.binding_id,
        },
        body.kind,
        body.requestId,
      );
      await db
        .from("native_push_test_runs")
        .update({
          status:
            result.status === "sent"
              ? "sent"
              : result.code === "provider_outcome_unknown"
                ? "unknown"
                : "failed",
          error_code: result.code,
          completed_at: new Date().toISOString(),
        })
        .eq("id", body.requestId);
      if (result.code === "unregistered")
        await db
          .from("native_push_registrations")
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", r.id)
          .eq("binding_id", r.binding_id)
          .eq("fcm_token", r.fcm_token);
      return Response.json(
        { accepted: result.status === "sent" },
        { status: result.status === "sent" ? 200 : 502 },
      );
    } catch {
      return Response.json({ error: "test_failed" }, { status: 503 });
    }
  }
  // Optional manual Dev scheduler QA. No cron is installed; no Web delivery is enabled.
  if (new URL(req.url).pathname.endsWith("/scheduler")) {
    const secret = Deno.env.get("ADDI_DEV_PUSH_QA_SECRET");
    if (
      !secret ||
      req.method !== "POST" ||
      req.headers.get("authorization") !== `Bearer ${secret}`
    )
      return new Response(null, { status: 403 });
    const { data: target, error } = await db
      .from("native_push_qa_target")
      .select("registration_id,expires_at")
      .eq("singleton", true)
      .maybeSingle();
    if (error || !target || Date.parse(target.expires_at) <= Date.now())
      return new Response(null, { status: 409 });
    const { data: registration } = await db
      .from("native_push_registrations")
      .select("user_id")
      .eq("id", target.registration_id)
      .is("revoked_at", null)
      .maybeSingle();
    if (!registration) return new Response(null, { status: 409 });
    try {
      const result = await runNativeAwareReminders(
        db,
        {
          web: async () => {
            throw Error("dev_web_send_disabled");
          },
          fcm: (t, k, id) => send(t.credentials, k, id),
        },
        {
          now: new Date(),
          onlyUserId: registration.user_id,
          allowTarget: (t) =>
            t.transport === "fcm" && t.targetId === target.registration_id,
        },
      );
      return Response.json(result);
    } catch {
      return Response.json({ error: "scheduler_failed" }, { status: 503 });
    }
  }
  return handler(req);
});
