import { dispatchNotificationPushes } from "@/lib/push/dispatch";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE_HEADERS = { "cache-control": "private, no-store" } as const;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const admin = createSupabaseAdminClient();
  const startedAt = new Date();
  const { data: generated, error: generationError } = await admin
    .rpc("generate_due_notifications", { p_now: startedAt.toISOString() });
  if (generationError) {
    return Response.json({ ok: false }, { status: 500, headers: NO_STORE_HEADERS });
  }

  const recentCutoff = new Date(startedAt.getTime() - 10 * 60_000).toISOString();
  const { data: notifications, error: notificationError } = await admin
    .from("notifications")
    .select("id,user_id,title,body,route")
    .neq("notification_type", "announcement")
    .gte("created_at", recentCutoff)
    .lte("created_at", startedAt.toISOString());
  if (notificationError) {
    return Response.json({ ok: false }, { status: 500, headers: NO_STORE_HEADERS });
  }

  const result = await dispatchNotificationPushes(admin, (notifications ?? []).map((notification) => ({
    id: notification.id,
    userId: notification.user_id,
    title: notification.title,
    body: notification.body,
    route: notification.route,
  })));
  const counts = generated?.[0] ?? { medication_count: 0, visit_count: 0 };
  return Response.json({
    ok: true,
    medicationCount: counts.medication_count ?? 0,
    visitCount: counts.visit_count ?? 0,
    ...result,
  }, { headers: NO_STORE_HEADERS });
}
