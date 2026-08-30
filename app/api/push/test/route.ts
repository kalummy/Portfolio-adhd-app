import { randomUUID } from "node:crypto";
import { isNotificationPushTestEnvironment } from "@/lib/preview-environment";
import {
  isPushEndpoint,
  type PushNotificationPayload,
  type PushSubscriptionInput,
} from "@/lib/push/contracts";
import {
  assertWebPushConfigured,
  isExpiredPushSubscriptionError,
  sendWebPush,
  WebPushConfigurationError,
} from "@/lib/push/server";
import {
  createSupabaseAdminClient,
  SupabaseAdminConfigurationError,
} from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}

export async function POST(request: Request) {
  if (!isNotificationPushTestEnvironment()) {
    return Response.json({ ok: false }, { status: 404 });
  }
  if (!isSameOriginRequest(request)) return Response.json({ ok: false }, { status: 403 });

  const sessionClient = await createServerSupabaseClient();
  const { data: userData, error: userError } = await sessionClient.auth.getUser();
  if (userError || !userData.user) return Response.json({ ok: false }, { status: 401 });

  const input = await request.json().catch(() => null) as { endpoint?: unknown } | null;
  if (!input || !isPushEndpoint(input.endpoint)) {
    return Response.json({ ok: false }, { status: 400 });
  }

  try {
    assertWebPushConfigured();
    const admin = createSupabaseAdminClient();
    const { data: subscriptions, error: subscriptionsError } = await admin
      .from("push_subscriptions")
      .select("endpoint,p256dh,auth")
      .eq("user_id", userData.user.id)
      .eq("endpoint", input.endpoint)
      .is("revoked_at", null);
    if (subscriptionsError) throw subscriptionsError;
    if (!subscriptions?.length) {
      return Response.json({ ok: false, code: "subscription_required" }, { status: 409 });
    }

    const notificationId = `preview-test:${randomUUID()}`;
    const firedAt = new Date().toISOString();
    const payload: PushNotificationPayload = {
      notificationId,
      title: "복용 알림",
      body: "오늘 복용기록이 없어요.",
      route: "/",
    };

    const { error: notificationError } = await admin.from("app_notifications").insert({
      user_id: userData.user.id,
      notification_id: notificationId,
      kind: "medication",
      title: payload.title,
      body: payload.body,
      url: payload.route,
      fired_at: firedAt,
    });
    if (notificationError) throw notificationError;

    let delivered = 0;
    let failed = 0;
    await Promise.all(subscriptions.map(async (subscription) => {
      const pushSubscription: PushSubscriptionInput = {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      };
      try {
        await sendWebPush(pushSubscription, payload);
        delivered += 1;
      } catch (error) {
        failed += 1;
        if (isExpiredPushSubscriptionError(error)) {
          await admin
            .from("push_subscriptions")
            .update({ revoked_at: new Date().toISOString() })
            .eq("endpoint", subscription.endpoint);
        }
      }
    }));

    if (delivered === 0) {
      const { error: cleanupError } = await admin
        .from("app_notifications")
        .delete()
        .eq("user_id", userData.user.id)
        .eq("notification_id", notificationId);
      if (cleanupError) throw cleanupError;
    }

    return Response.json(
      { ok: delivered > 0, notificationId, delivered, failed },
      { status: delivered > 0 ? 200 : 502, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const unavailable = error instanceof WebPushConfigurationError
      || error instanceof SupabaseAdminConfigurationError;
    return Response.json({ ok: false }, { status: unavailable ? 503 : 500 });
  }
}
