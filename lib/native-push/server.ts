import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEV_SUPABASE,
  DISABLED,
  UUID,
  validInstallation,
  validRegistration,
  sha256,
} from "./contracts";
import type { createFcmSender } from "./fcm";
import {
  getReminderContent,
  type ReminderDeliveryKind,
} from "../reminders/policy";

type Sender = ReturnType<typeof createFcmSender>;
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
const exact = (value: object, keys: string[]) =>
  Object.keys(value).every((k) => keys.includes(k));
const identityKeys = ["installationId", "secret", "revision"];
/** Dev-only API. No browser cookie, submitted user ID, or editable metadata is trusted. */
export function nativePushHandler(
  db: SupabaseClient,
  send: Sender,
  configuredUrl: string,
) {
  if (configuredUrl !== DEV_SUPABASE) throw Error("dev_project_required");
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get("origin");
    if (origin && origin !== "https://localhost")
      return json({ error: "origin_denied" }, 403);
    const cors = (r: Response) => {
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
            "Access-Control-Max-Age": "600",
          },
        }),
      );
    if (req.method !== "POST")
      return cors(json({ error: "method_denied" }, 405));
    try {
      const text = await req.text();
      if (text.length > 12000)
        return cors(json({ error: "invalid_request" }, 400));
      const body = JSON.parse(text);
      const action = new URL(req.url).pathname.split("/").pop();
      if (!validInstallation(body as unknown))
        return cors(json({ error: "invalid_request" }, 400));
      const common = {
        p_installation_id: body.installationId,
        p_secret_hash: await sha256(body.secret),
        p_revision: body.revision,
      };
      if (action === "revoke" || action === "rotate") {
        const allowed =
          action === "revoke"
            ? identityKeys
            : [...identityKeys, "bindingId", "token"];
        if (
          !exact(body, allowed) ||
          (action === "rotate" &&
            (!UUID.test(body.bindingId) ||
              typeof body.token !== "string" ||
              !/^[A-Za-z0-9_:\-.]{20,4096}$/.test(body.token)))
        )
          return cors(json({ error: "invalid_request" }, 400));
        const result = await db.rpc(
          action === "revoke" ? "revoke_native_push" : "rotate_native_push",
          action === "revoke"
            ? common
            : { ...common, p_binding_id: body.bindingId, p_token: body.token },
        );
        if (result.error || (action === "revoke" && result.data !== true))
          return cors(json({ error: "maintenance_pending" }, 409));
        // Capability grants no read access, owner change, preference enablement, or send.
        return cors(json({ ok: true }));
      }
      const auth = req.headers.get("authorization");
      if (!auth?.startsWith("Bearer "))
        return cors(json({ error: "authentication_required" }, 401));
      const { data, error } = await db.auth.getUser(auth.slice(7));
      if (error || !data.user || data.user.is_anonymous)
        return cors(json({ error: "authentication_required" }, 401));
      if (action === "register") {
        if (
          !validRegistration(body) ||
          !exact(body, [
            ...identityKeys,
            "bindingId",
            "token",
            "appVersion",
            "preferences",
          ])
        )
          return cors(json({ error: "invalid_request" }, 400));
        const result = await db.rpc("register_native_push", {
          ...common,
          p_user_id: data.user.id,
          p_binding_id: body.bindingId,
          p_token: body.token,
          p_app_version: body.appVersion,
          p_preferences: body.preferences,
        });
        if (result.error)
          return cors(json({ error: "registration_conflict" }, 409));
        return cors(json({ ok: true }));
      }
      if (action === "status" || action === "test") {
        if (
          !exact(
            body,
            action === "test"
              ? [...identityKeys, "requestId", "kind"]
              : identityKeys,
          )
        )
          return cors(json({ error: "invalid_request" }, 400));
        const result = await db
          .from("native_push_registrations")
          .select(
            "id,binding_id,fcm_token,medication_enabled,visit_day_enabled,mood_enabled,revoked_at",
          )
          .eq("installation_id", body.installationId)
          .eq("installation_secret_hash", common.p_secret_hash)
          .eq("user_id", data.user.id)
          .maybeSingle();
        if (result.error) return cors(json({ error: "read_failed" }, 503));
        const row = result.data;
        if (action === "status")
          return cors(
            json({
              active: !!row && !row.revoked_at,
              preferences:
                row && !row.revoked_at
                  ? {
                      medication: row.medication_enabled,
                      visit_day: row.visit_day_enabled,
                      mood: row.mood_enabled,
                    }
                  : DISABLED,
            }),
          );
        if (
          !row ||
          row.revoked_at ||
          !UUID.test(body.requestId) ||
          !["daily", "mood", "visit_day_today"].includes(body.kind)
        )
          return cors(json({ error: "test_not_available" }, 409));
        const kind = body.kind as ReminderDeliveryKind;
        const pref = getReminderContent(kind).kind + "_enabled";
        if (!row[pref as keyof typeof row])
          return cors(json({ error: "preference_disabled" }, 409));
        const claim = await db.rpc("claim_native_push_test", {
          p_id: body.requestId,
          p_registration: row.id,
          p_kind: kind,
        });
        if (claim.error || claim.data !== true)
          return cors(json({ error: "test_not_allowed" }, 409));
        const outcome = await send(
          {
            token: row.fcm_token,
            installationId: body.installationId,
            bindingId: row.binding_id,
          },
          kind,
          body.requestId,
        );
        await db
          .from("native_push_test_runs")
          .update({
            status:
              outcome.status === "sent"
                ? "sent"
                : outcome.code === "provider_outcome_unknown"
                  ? "unknown"
                  : "failed",
            completed_at: new Date().toISOString(),
            error_code: outcome.code,
          })
          .eq("id", body.requestId);
        if (outcome.code === "unregistered")
          await db
            .from("native_push_registrations")
            .update({ revoked_at: new Date().toISOString() })
            .eq("id", row.id)
            .eq("binding_id", row.binding_id)
            .eq("fcm_token", row.fcm_token);
        return cors(
          json(
            { accepted: outcome.status === "sent" },
            outcome.status === "sent" ? 200 : 502,
          ),
        );
      }
      return cors(json({ error: "not_found" }, 404));
    } catch {
      return cors(json({ error: "request_failed" }, 400));
    }
  };
}
