import { DEV_FIREBASE } from "./contracts";
import {
  getReminderContent,
  type ReminderDeliveryKind,
} from "../reminders/policy";
export type FcmCredential = {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};
export type DeliveryOutcome = {
  status: "sent" | "retryable_failed" | "permanent_failed" | "cancelled";
  http: number | null;
  code: string | null;
};
export function classifyFcm(status: number, body: unknown): DeliveryOutcome {
  if (status >= 200 && status < 300)
    return { status: "sent", http: null, code: null };
  const error =
    body && typeof body === "object"
      ? (body as { error?: { details?: Array<{ errorCode?: string }> } }).error
      : null;
  if (
    status === 404 &&
    error?.details?.some((x) => x.errorCode === "UNREGISTERED")
  )
    return { status: "permanent_failed", http: 404, code: "unregistered" };
  if (status === 429)
    return { status: "retryable_failed", http: status, code: "provider_429" };
  if (status >= 500 && status <= 599)
    return { status: "retryable_failed", http: status, code: "provider_5xx" };
  return { status: "permanent_failed", http: status, code: "provider_4xx" };
}
const b64 = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
const encoded = (v: unknown) =>
  b64(new TextEncoder().encode(JSON.stringify(v)));
export function createFcmSender(
  credential: FcmCredential,
  fetcher: typeof fetch = fetch,
) {
  if (
    credential.project_id !== DEV_FIREBASE ||
    !credential.client_email.endsWith(
      `@${DEV_FIREBASE}.iam.gserviceaccount.com`,
    ) ||
    !credential.private_key.includes("BEGIN PRIVATE KEY")
  )
    throw Error("dev_fcm_credential_required");
  let access: { token: string; expires: number } | undefined;
  async function bearer() {
    if (access && access.expires > Date.now() + 60000) return access.token;
    const now = Math.floor(Date.now() / 1000);
    const unsigned =
      encoded({ alg: "RS256", typ: "JWT" }) +
      "." +
      encoded({
        iss: credential.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      });
    const der = Uint8Array.from(
      atob(credential.private_key.replace(/-----[^-]+-----|\s/g, "")),
      (c) => c.charCodeAt(0),
    );
    const key = await crypto.subtle.importKey(
      "pkcs8",
      der,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const assertion =
      unsigned +
      "." +
      b64(
        new Uint8Array(
          await crypto.subtle.sign(
            "RSASSA-PKCS1-v1_5",
            key,
            new TextEncoder().encode(unsigned),
          ),
        ),
      );
    const response = await fetcher("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error("fcm_credential_unavailable");
    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    if (!data.access_token) throw Error("fcm_credential_unavailable");
    access = {
      token: data.access_token,
      expires: Date.now() + data.expires_in * 1000,
    };
    return access.token;
  }
  return async (
    target: { token: string; installationId: string; bindingId: string },
    kind: ReminderDeliveryKind,
    deliveryId: string,
  ): Promise<DeliveryOutcome> => {
    // Credential failures occur before send and must not be mistaken for accepted sends.
    let auth: string;
    try {
      auth = await bearer();
    } catch {
      return {
        status: "permanent_failed",
        http: null,
        code: "provider_outcome_unknown",
      };
    }
    const content = getReminderContent(kind);
    try {
      const response = await fetcher(
        `https://fcm.googleapis.com/v1/projects/${DEV_FIREBASE}/messages:send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${auth}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: target.token,
              android: { priority: "HIGH", ttl: "60s" },
              data: {
                installation_id: target.installationId,
                binding_id: target.bindingId,
                delivery_id: deliveryId,
                kind: content.kind,
                route: content.route,
                title: content.title,
                body: content.body,
                expires_at: String(Date.now() + 60000),
              },
            },
          }),
          signal: AbortSignal.timeout(10000),
        },
      );
      return classifyFcm(
        response.status,
        await response.json().catch(() => null),
      );
    } catch {
      return {
        status: "permanent_failed",
        http: null,
        code: "provider_outcome_unknown",
      };
    }
  };
}
