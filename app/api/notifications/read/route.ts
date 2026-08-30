import { createServerSupabaseClient } from "@/lib/supabase/server";

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) return Response.json({ ok: false }, { status: 403 });

  const body = await request.json().catch(() => null) as { notificationId?: unknown } | null;
  if (
    !body
    || typeof body.notificationId !== "string"
    || body.notificationId.length < 1
    || body.notificationId.length > 256
  ) {
    return Response.json({ ok: false }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return Response.json({ ok: false }, { status: 401 });

  const { error } = await supabase
    .from("app_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("notification_id", body.notificationId)
    .is("read_at", null);
  if (error) return Response.json({ ok: false }, { status: 500 });

  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
