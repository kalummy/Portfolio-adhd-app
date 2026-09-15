import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import {
  nativePushHandler,
  createFcmSender,
  runNativeAwareReminders,
  DEV_SUPABASE,
  UUID,
  getReminderContent,
} from "./bundle.js";
const url = Deno.env.get("SUPABASE_URL");
if (url !== DEV_SUPABASE) throw Error("dev_project_required");
const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const send = createFcmSender(
  JSON.parse(Deno.env.get("ADDI_DEV_FCM_CREDENTIAL") || "{}"),
);
const handler = nativePushHandler(db, send, url);
Deno.serve(async (req) => {
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
