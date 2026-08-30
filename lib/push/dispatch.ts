import "server-only";

import type { PushSubscription } from "web-push";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getWebPushStatusCode,
  isWebPushConfigured,
  sendNotificationPush,
  type PushNotificationPayload,
} from "./server";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;
type DispatchableNotification = PushNotificationPayload & { userId: string };

export async function dispatchNotificationPushes(
  admin: AdminClient,
  notifications: DispatchableNotification[],
) {
  if (notifications.length === 0 || !isWebPushConfigured()) {
    return { sentCount: 0, failedCount: 0 };
  }

  const userIds = [...new Set(notifications.map((notification) => notification.userId))];
  const { data: subscriptions, error: subscriptionError } = await admin
    .from("push_subscriptions")
    .select("user_id,endpoint,p256dh,auth")
    .in("user_id", userIds);
  if (subscriptionError) throw subscriptionError;

  const subscriptionByUserId = new Map(
    (subscriptions ?? []).map((subscription) => [subscription.user_id, subscription]),
  );
  const deliverable = notifications.filter((notification) => (
    subscriptionByUserId.has(notification.userId)
  ));
  if (deliverable.length === 0) return { sentCount: 0, failedCount: 0 };

  const { data: claims, error: claimError } = await admin
    .from("notification_push_deliveries")
    .upsert(deliverable.map((notification) => ({
      notification_id: notification.id,
      user_id: notification.userId,
      status: "claimed",
    })), {
      onConflict: "notification_id",
      ignoreDuplicates: true,
    })
    .select("notification_id,user_id");
  if (claimError) throw claimError;

  const notificationById = new Map(
    notifications.map((notification) => [notification.id, notification]),
  );
  let sentCount = 0;
  let failedCount = 0;

  for (const claim of claims ?? []) {
    const notification = notificationById.get(claim.notification_id);
    const subscription = subscriptionByUserId.get(claim.user_id);
    if (!notification || !subscription) continue;

    try {
      await sendNotificationPush({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      } as PushSubscription, notification);
      sentCount += 1;
      await admin.from("notification_push_deliveries").update({
        status: "sent",
        completed_at: new Date().toISOString(),
        error_code: null,
      }).eq("notification_id", notification.id);
    } catch (error) {
      failedCount += 1;
      const statusCode = getWebPushStatusCode(error);
      await admin.from("notification_push_deliveries").update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_code: statusCode ? `http_${statusCode}` : "send_failed",
      }).eq("notification_id", notification.id);
      if (statusCode === 404 || statusCode === 410) {
        await admin.from("push_subscriptions").delete().eq("user_id", claim.user_id);
      }
    }
  }

  return { sentCount, failedCount };
}
