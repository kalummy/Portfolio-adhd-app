import { getKstDateKey, isValidDateKey } from "@/lib/kst-date";
import { NOTIFICATION_CONTENT } from "@/lib/notifications/constants";
import { dispatchNotificationPushes } from "@/lib/push/dispatch";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const NO_STORE_HEADERS = { "cache-control": "private, no-store" } as const;

type DispatchInput = {
  notificationType?: unknown;
  localDate?: unknown;
};

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ ok: false }, { status: 401, headers: NO_STORE_HEADERS });

  const input = await request.json().catch(() => null) as DispatchInput | null;
  const localDate = typeof input?.localDate === "string" ? input.localDate : "";
  const notificationType = input?.notificationType;
  if (
    !isValidDateKey(localDate)
    || (notificationType !== "visit_reminder" && notificationType !== "mood_reminder")
  ) {
    return Response.json({ ok: false }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const admin = createSupabaseAdminClient();
  if (notificationType === "visit_reminder") {
    if (localDate !== getKstDateKey()) {
      return Response.json({ ok: true, sentCount: 0 }, { status: 202, headers: NO_STORE_HEADERS });
    }
    const { data: visit, error: visitError } = await admin
      .from("visit_schedules")
      .select("visit_date")
      .eq("user_id", user.id)
      .eq("visit_id", "upcoming")
      .eq("visit_date", localDate)
      .maybeSingle();
    if (visitError) return Response.json({ ok: false }, { status: 500, headers: NO_STORE_HEADERS });
    if (!visit) return Response.json({ ok: false }, { status: 409, headers: NO_STORE_HEADERS });
  } else {
    const { data: mood, error: moodError } = await admin
      .from("mood_records")
      .select("mood_date")
      .eq("user_id", user.id)
      .eq("mood_date", localDate)
      .eq("analysis_status", "completed")
      .maybeSingle();
    if (moodError) return Response.json({ ok: false }, { status: 500, headers: NO_STORE_HEADERS });
    if (!mood) return Response.json({ ok: false }, { status: 409, headers: NO_STORE_HEADERS });
  }

  const isVisit = notificationType === "visit_reminder";
  const content = NOTIFICATION_CONTENT[notificationType];
  const route = isVisit ? "/visits" : "/moods?tab=report";
  const dedupeKey = `${isVisit ? "visit" : "mood"}:${localDate}`;
  const { error: insertError } = await admin.from("notifications").upsert({
    user_id: user.id,
    notification_type: notificationType,
    title: content.title,
    body: content.body,
    route,
    local_date: localDate,
    reminder_slot: null,
    dedupe_key: dedupeKey,
  }, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
  if (insertError) return Response.json({ ok: false }, { status: 500, headers: NO_STORE_HEADERS });

  const { data: notification, error: notificationError } = await admin
    .from("notifications")
    .select("id,user_id,title,body,route")
    .eq("user_id", user.id)
    .eq("dedupe_key", dedupeKey)
    .single();
  if (notificationError) {
    return Response.json({ ok: false }, { status: 500, headers: NO_STORE_HEADERS });
  }

  const result = await dispatchNotificationPushes(admin, [{
    id: notification.id,
    userId: notification.user_id,
    title: notification.title,
    body: notification.body,
    route: notification.route,
  }]);
  return Response.json({ ok: true, ...result }, { status: 202, headers: NO_STORE_HEADERS });
}
