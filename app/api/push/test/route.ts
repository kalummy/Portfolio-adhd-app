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

const PRODUCTION_SUPABASE_HOST = "joffvlsyxivveqycjrio.supabase.co";
const PRODUCTION_E2E_NOTIFICATION_PREFIX = "production-twa-e2e:";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}

function getProductionPushE2EUserId() {
  if (process.env.VERCEL_ENV !== "production") return null;

  const userId = process.env.PRODUCTION_PUSH_E2E_USER_ID?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!userId || !UUID_PATTERN.test(userId) || !supabaseUrl) return null;

  try {
    return new URL(supabaseUrl).hostname === PRODUCTION_SUPABASE_HOST ? userId : null;
  } catch {
    return null;
  }
}

function isEndpointOnlyInput(value: unknown): value is { endpoint: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1
    && keys[0] === "endpoint"
    && isPushEndpoint((value as { endpoint?: unknown }).endpoint);
}

function isEmptyInput(value: unknown): value is Record<string, never> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).length === 0;
}

export async function POST(request: Request) {
  const isPreviewTest = isNotificationPushTestEnvironment();
  const productionTestUserId = getProductionPushE2EUserId();
  if (!isPreviewTest && !productionTestUserId) {
    return Response.json({ ok: false }, { status: 404 });
  }
  if (!isSameOriginRequest(request)) return Response.json({ ok: false }, { status: 403 });

  const sessionClient = await createServerSupabaseClient();
  const { data: userData, error: userError } = await sessionClient.auth.getUser();
  if (userError || !userData.user) return Response.json({ ok: false }, { status: 401 });
  if (productionTestUserId && userData.user.id !== productionTestUserId) {
    return Response.json({ ok: false }, { status: 404 });
  }

  const input = await request.json().catch(() => null);
  if ((isPreviewTest && !isEndpointOnlyInput(input))
    || (productionTestUserId && !isEmptyInput(input))) {
    return Response.json({ ok: false }, { status: 400 });
  }

  try {
    assertWebPushConfigured();
    const admin = createSupabaseAdminClient();
    const subscriptionQuery = admin
      .from("push_subscriptions")
      .select("endpoint,p256dh,auth,medication_enabled")
      .eq("user_id", userData.user.id)
      .is("revoked_at", null)
      .limit(2);
    if (isPreviewTest && isEndpointOnlyInput(input)) {
      subscriptionQuery.eq("endpoint", input.endpoint);
    }
    const { data: subscriptions, error: subscriptionError } = await subscriptionQuery;
    if (subscriptionError) throw subscriptionError;
    if (!subscriptions || subscriptions.length !== 1
      || subscriptions[0].medication_enabled !== true) {
      return Response.json({ ok: false, code: "subscription_required" }, { status: 409 });
    }
    const subscription = subscriptions[0];

    if (productionTestUserId) {
      const { count, error: priorTestError } = await admin
        .from("app_notifications")
        .select("notification_id", { count: "exact", head: true })
        .eq("user_id", userData.user.id)
        .like("notification_id", `${PRODUCTION_E2E_NOTIFICATION_PREFIX}%`);
      if (priorTestError) throw priorTestError;
      if ((count ?? 0) > 0) return Response.json({ ok: false }, { status: 404 });
    }

    const notificationId = isPreviewTest
      ? `preview-test:${randomUUID()}`
      : `${PRODUCTION_E2E_NOTIFICATION_PREFIX}${new Date().toISOString()}:${randomUUID()}`;
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
    if (notificationError) {
      if (!isPreviewTest && notificationError.code === "23505") {
        return Response.json({ ok: false, code: "test_already_sent" }, { status: 409 });
      }
      throw notificationError;
    }

    let delivered = 0;
    let failed = 0;
    let providerStatusCode: number | null = null;
    const pushSubscription: PushSubscriptionInput = {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    };
    try {
      const providerResult = await sendWebPush(pushSubscription, payload);
      providerStatusCode = providerResult.statusCode;
      delivered = 1;
    } catch (error) {
      failed = 1;
      if (isExpiredPushSubscriptionError(error)) {
        await admin
          .from("push_subscriptions")
          .update({ revoked_at: new Date().toISOString() })
          .eq("user_id", userData.user.id)
          .eq("endpoint", subscription.endpoint);
      }
    }

    if (delivered === 0) {
      const { error: cleanupError } = await admin
        .from("app_notifications")
        .delete()
        .eq("user_id", userData.user.id)
        .eq("notification_id", notificationId);
      if (cleanupError) throw cleanupError;
    }

    return Response.json(
      {
        ok: delivered > 0,
        notificationId,
        delivered,
        failed,
        providerAccepted: delivered > 0,
        providerStatusCode,
      },
      { status: delivered > 0 ? 200 : 502, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const unavailable = error instanceof WebPushConfigurationError
      || error instanceof SupabaseAdminConfigurationError;
    return Response.json({ ok: false }, { status: unavailable ? 503 : 500 });
  }
}
