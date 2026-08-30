import { NOTIFICATION_RETENTION_DAYS } from "@/lib/notifications/constants";
import { fromNotificationRow, NOTIFICATION_COLUMNS } from "@/lib/notifications/mapper";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "cache-control": "private, no-store" } as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ notifications: [] }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const cutoff = new Date(Date.now() - (NOTIFICATION_RETENTION_DAYS * 86_400_000)).toISOString();
  const { data, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("user_id", user.id)
    .neq("notification_type", "announcement")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) {
    return Response.json({ notifications: [] }, { status: 500, headers: NO_STORE_HEADERS });
  }

  return Response.json({
    notifications: (data ?? []).map((row) => fromNotificationRow(row as never)),
  }, { headers: NO_STORE_HEADERS });
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ ok: false }, { status: 401, headers: NO_STORE_HEADERS });

  const input = await request.json().catch(() => null) as {
    notificationId?: unknown;
    all?: unknown;
  } | null;
  const notificationId = typeof input?.notificationId === "string"
    ? input.notificationId
    : null;
  if (input?.all !== true && (!notificationId || !UUID_PATTERN.test(notificationId))) {
    return Response.json({ ok: false }, { status: 400, headers: NO_STORE_HEADERS });
  }

  let query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .neq("notification_type", "announcement")
    .is("read_at", null);
  if (input?.all !== true) query = query.eq("id", notificationId as string);

  const { error } = await query;
  if (error) return Response.json({ ok: false }, { status: 500, headers: NO_STORE_HEADERS });
  return Response.json({ ok: true }, { headers: NO_STORE_HEADERS });
}
