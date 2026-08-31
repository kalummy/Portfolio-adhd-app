import { getActiveReminderWindows, isReminderSchedulerEnabled } from "@/lib/reminders/policy";
import { runReminderScheduler } from "@/lib/reminders/scheduler";
import { SupabaseReminderDispatchRepository } from "@/lib/reminders/supabase-repository";
import { assertWebPushConfigured, sendWebPush } from "@/lib/push/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return json({ ok: false }, 401);
  }

  if (!isReminderSchedulerEnabled(process.env.REMINDER_SCHEDULER_ENABLED)) {
    return json({
      ok: true,
      status: "disabled",
      claimed: 0,
      sent: 0,
    });
  }

  const now = new Date();
  const windows = getActiveReminderWindows(now);
  if (windows.length === 0) {
    return json({ ok: true, status: "outside_window" });
  }

  try {
    assertWebPushConfigured();
    const admin = createSupabaseAdminClient();
    const repository = new SupabaseReminderDispatchRepository(admin);
    const runs = [];
    for (const window of windows) {
      const result = await runReminderScheduler({
        window,
        now,
        repository,
        sendPush: sendWebPush,
        clock: () => new Date(),
      });
      runs.push({ reminderSlot: window.slotKey, result });
    }
    const totals = runs.reduce((summary, run) => ({
      claimed: summary.claimed + run.result.claimed,
      sent: summary.sent + run.result.sent,
      retryableFailed: summary.retryableFailed + run.result.retryableFailed,
      permanentFailed: summary.permanentFailed + run.result.permanentFailed,
      cancelled: summary.cancelled + run.result.cancelled,
    }), {
      claimed: 0,
      sent: 0,
      retryableFailed: 0,
      permanentFailed: 0,
      cancelled: 0,
    });
    return json({
      ok: true,
      status: "processed",
      localDate: windows[0].localDate,
      reminderSlots: runs.map(({ reminderSlot }) => reminderSlot),
      ...totals,
    });
  } catch {
    return json({ ok: false, status: "scheduler_unavailable" }, 500);
  }
}
