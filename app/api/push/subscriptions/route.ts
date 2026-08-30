import {
  isPushEndpoint,
  isPushPreferenceKind,
  isPushSubscriptionInput,
} from "@/lib/push/contracts";
import {
  createSupabaseAdminClient,
} from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}

async function authenticatedUserId() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return Response.json({ ok: false }, { status: 403 });

  const userId = await authenticatedUserId();
  if (!userId) return Response.json({ ok: false }, { status: 401 });

  const input = await request.json().catch(() => null);
  if (!isPushSubscriptionInput(input)) {
    return Response.json({ ok: false }, { status: 400 });
  }

  try {
    const now = new Date().toISOString();
    const admin = createSupabaseAdminClient();
    const { data: existing, error: existingError } = await admin
      .from("push_subscriptions")
      .select("user_id,revoked_at")
      .eq("endpoint", input.endpoint)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing && existing.user_id !== userId) {
      return Response.json({ ok: false }, { status: 409 });
    }

    const shouldInitializePreferences = Boolean(
      input.startWithPreferencesDisabled && (!existing || existing.revoked_at !== null),
    );
    const { error } = await admin.from("push_subscriptions").upsert({
      user_id: userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      updated_at: now,
      revoked_at: null,
      ...(shouldInitializePreferences ? {
        medication_enabled: false,
        visit_day_enabled: false,
        mood_enabled: false,
      } : {}),
    }, { onConflict: "endpoint" });
    if (error) throw error;

    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, reason: "push_unavailable" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) return Response.json({ ok: false }, { status: 403 });

  const userId = await authenticatedUserId();
  if (!userId) return Response.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => null) as { endpoint?: unknown } | null;
  if (!body || typeof body.endpoint !== "string" || body.endpoint.length > 4096) {
    return Response.json({ ok: false }, { status: 400 });
  }

  try {
    const now = new Date().toISOString();
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("push_subscriptions")
      .update({ revoked_at: now, updated_at: now })
      .eq("user_id", userId)
      .eq("endpoint", body.endpoint);
    if (error) throw error;

    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, reason: "push_unavailable" }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) return Response.json({ ok: false }, { status: 403 });

  const userId = await authenticatedUserId();
  if (!userId) return Response.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => null) as {
    endpoint?: unknown;
    kind?: unknown;
    enabled?: unknown;
  } | null;
  if (!body || !isPushEndpoint(body.endpoint) || !isPushPreferenceKind(body.kind)
    || typeof body.enabled !== "boolean") {
    return Response.json({ ok: false }, { status: 400 });
  }

  const columnByKind = {
    medication: "medication_enabled",
    visit_day: "visit_day_enabled",
    mood: "mood_enabled",
  } as const;

  try {
    const now = new Date().toISOString();
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("push_subscriptions")
      .update({ [columnByKind[body.kind]]: body.enabled, updated_at: now })
      .eq("user_id", userId)
      .eq("endpoint", body.endpoint)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ ok: false }, { status: 409 });

    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, reason: "push_unavailable" }, { status: 503 });
  }
}
