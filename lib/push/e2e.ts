import { createHash } from "node:crypto";
import type { PushNotificationPayload, PushSubscriptionInput } from "./contracts";

export type ClaimedPushE2ERun = {
  id: string;
  user_id: string;
  subscription_id: string;
  subscription_fingerprint: string;
  status: "consumed";
  expires_at: string;
  consumed_at: string;
  subscription: {
    id: string;
    user_id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    revoked_at: string | null;
  };
};

export type PushE2EResult = {
  status: "consumed" | "failed";
  provider_status: number | null;
  error_code: "provider_rejected" | "provider_timeout" | "provider_network_error"
    | "target_invalid" | "disabled_before_send" | null;
};

export type PushE2EDependencies = {
  enabled: () => boolean;
  getUserId: () => Promise<string | null>;
  assertConfigured: () => void;
  // Must commit the atomic ready -> consumed transition before returning a row.
  claim: (runId: string, userId: string) => Promise<ClaimedPushE2ERun | null>;
  finish: (runId: string, result: PushE2EResult) => Promise<void>;
  send: (subscription: PushSubscriptionInput, payload: PushNotificationPayload) => Promise<{ statusCode: number }>;
  now: () => number;
};

export function isPushE2EEnabled(value: string | undefined) {
  return value === "true";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isRunIdOnly(value: unknown): value is { runId: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as { runId?: unknown };
  return Object.keys(value).length === 1 && typeof input.runId === "string" && UUID.test(input.runId);
}

function reply(status: number, code: string, extra: Record<string, unknown> = {}) {
  return Response.json({ ok: status === 200, code, ...extra }, {
    status, headers: { "Cache-Control": "no-store" },
  });
}

function isExactTarget(run: ClaimedPushE2ERun, runId: string, userId: string, now: number) {
  const subscription = run.subscription;
  return run.id === runId && run.user_id === userId && run.status === "consumed"
    && Number.isFinite(Date.parse(run.consumed_at)) && Date.parse(run.expires_at) > now
    && subscription.id === run.subscription_id && subscription.user_id === run.user_id
    && subscription.revoked_at === null && /^[0-9a-f]{64}$/.test(run.subscription_fingerprint)
    && createHash("sha256").update(subscription.endpoint, "utf8").digest("hex") === run.subscription_fingerprint;
}

function providerStatus(value: unknown): number | null {
  if (!value || typeof value !== "object" || !("statusCode" in value)) return null;
  const code = value.statusCode;
  return typeof code === "number" && Number.isInteger(code) && code >= 100 && code <= 599 ? code : null;
}

function failedResult(error: unknown): PushE2EResult {
  const status = providerStatus(error);
  // web-push 3.6.7 uses this exact message on socket timeout. Never persist the error itself.
  const timeout = error instanceof Error && (error.message === "Socket timeout"
    || ("code" in error && (error.code === "ETIMEDOUT" || error.code === "ESOCKETTIMEDOUT")));
  return { status: "failed", provider_status: status,
    error_code: status !== null ? "provider_rejected" : timeout ? "provider_timeout" : "provider_network_error" };
}

export async function handlePushE2E(request: Request, deps: PushE2EDependencies) {
  if (!deps.enabled()) return reply(404, "disabled");
  if (request.headers.get("origin") !== new URL(request.url).origin) return reply(403, "origin_required");
  try {
    const input = await request.json().catch(() => null);
    if (!isRunIdOnly(input)) return reply(400, "run_id_required");
    const userId = await deps.getUserId();
    if (!userId) return reply(401, "authentication_required");
    deps.assertConfigured();
    // An ambiguous DB response never grants permission to send. No claim retry here.
    const run = await deps.claim(input.runId, userId);
    if (!run) return reply(409, "run_unavailable");

    let result: PushE2EResult;
    if (!isExactTarget(run, input.runId, userId, deps.now())) {
      result = { status: "failed", provider_status: null, error_code: "target_invalid" };
    } else if (!deps.enabled()) {
      result = { status: "failed", provider_status: null, error_code: "disabled_before_send" };
    } else {
      const payload: PushNotificationPayload = {
        notificationId: `push-e2e:${input.runId}`,
        title: "ADDI 알림 테스트",
        body: "알림이 정상적으로 도착했어요.",
        route: "/",
      };
      try {
        // Exactly one invocation; never fan out, retry, revoke, or create notification history.
        const response = await deps.send({ endpoint: run.subscription.endpoint,
          keys: { p256dh: run.subscription.p256dh, auth: run.subscription.auth } }, payload);
        const status = providerStatus(response);
        result = status !== null && status >= 200 && status < 300
          ? { status: "consumed", provider_status: status, error_code: null }
          : failedResult(response);
      } catch (error) {
        result = failedResult(error);
      }
    }

    try {
      await deps.finish(input.runId, result);
    } catch {
      // The consumed row remains spent even if result persistence fails or the process dies.
      return reply(503, "result_record_failed", { retryable: false });
    }
    return reply(result.status === "consumed" ? 200 : 502,
      result.status === "consumed" ? "provider_accepted" : result.error_code!,
      { runId: input.runId, providerStatus: result.provider_status, retryable: false });
  } catch {
    // Never return/log raw DB errors, endpoints, keys, or provider errors.
    return reply(503, "e2e_unavailable", { retryable: false });
  }
}
