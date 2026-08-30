import { isPushEndpoint } from "@/lib/push/contracts";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return Response.json({ ok: false }, { status: 403 });

  const supabase = await createServerSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return Response.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => null) as { endpoint?: unknown } | null;
  if (!body || !isPushEndpoint(body.endpoint)) {
    return Response.json({ ok: false }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id,medication_enabled,visit_day_enabled,mood_enabled")
    .eq("user_id", userData.user.id)
    .eq("endpoint", body.endpoint)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) return Response.json({ ok: false }, { status: 500 });

  return Response.json(
    {
      ok: true,
      active: Boolean(data),
      preferences: data ? {
        medication: data.medication_enabled,
        visit_day: data.visit_day_enabled,
        mood: data.mood_enabled,
      } : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
