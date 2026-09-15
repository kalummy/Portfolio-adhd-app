import "server-only";
import { sendWebPush } from "../push/server";
import { isPushSubscriptionInput } from "../push/contracts";
import { getReminderContent } from "../reminders/policy";
import type { Transport } from "./scheduler";
/** Node adapter for a future approved scheduler rollout. Dev Edge never loads/sends this. */
export const webReminderTransport: Transport = async (
  target,
  kind,
  deliveryId,
) => {
  if (
    target.transport !== "web" ||
    !isPushSubscriptionInput(target.credentials)
  )
    throw Error("invalid_web_target");
  const content = getReminderContent(kind);
  try {
    await sendWebPush(target.credentials, {
      notificationId:
        "reminder:" + deliveryId.slice(0, deliveryId.lastIndexOf(":")),
      title: content.title,
      body: content.body,
      route: content.route,
    });
    return { status: "sent", http: null, code: null };
  } catch (error) {
    const code =
      error && typeof error === "object" && "statusCode" in error
        ? error.statusCode
        : null;
    if (code === 404 || code === 410)
      return { status: "permanent_failed", http: code, code: "unregistered" };
    if (code === 429)
      return { status: "retryable_failed", http: 429, code: "provider_429" };
    if (typeof code === "number" && code >= 500 && code <= 599)
      return { status: "retryable_failed", http: code, code: "provider_5xx" };
    if (typeof code === "number" && code >= 400 && code <= 499)
      return { status: "permanent_failed", http: code, code: "provider_4xx" };
    return {
      status: "permanent_failed",
      http: null,
      code: "provider_outcome_unknown",
    };
  }
};
