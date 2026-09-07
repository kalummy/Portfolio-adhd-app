import { createHash } from "node:crypto";
import { isPushE2EEnabled } from "./e2e";

export const E2E_CHROME_FINGERPRINT = "dd60ebf0074ab465";
export type E2EOffer = { runId: string; expiresAt: string };
export type E2EReadyRun = {
  id: string; user_id: string; subscription_id: string; subscription_fingerprint: string;
  status: string; created_at: string; expires_at: string;
};
export type E2ETarget = { id: string; user_id: string; endpoint: string; revoked_at: string | null };
export type E2EOfferDependencies = {
  enabled: () => string | undefined;
  scheduler: () => string | undefined;
  getUserId: () => Promise<string | null>;
  getRuns: (userId: string) => Promise<E2EReadyRun[]>;
  getTargets: () => Promise<{ rows: E2ETarget[]; count: number | null }>;
  now: () => number;
  fingerprint: (endpoint: string) => string;
};

export function endpointFingerprint(endpoint: string) {
  return createHash("sha256").update(endpoint, "utf8").digest("hex");
}

// Read-only UI eligibility. The existing POST independently authorizes and consumes the run.
export async function getE2EOffer(deps: E2EOfferDependencies): Promise<E2EOffer | null> {
  if (!isPushE2EEnabled(deps.enabled()) || deps.scheduler() !== "false") return null;
  try {
    const userId = await deps.getUserId();
    if (!userId) return null;
    const runs = await deps.getRuns(userId);
    if (runs.length !== 1) return null;
    const run = runs[0];
    const now = deps.now();
    const created = Date.parse(run.created_at);
    const expires = Date.parse(run.expires_at);
    if (run.user_id !== userId || run.status !== "ready" || !Number.isFinite(created)
      || !Number.isFinite(expires) || created > now || expires <= now
      || expires - created > 10 * 60_000 || expires <= created
      || !/^[0-9a-f]{64}$/.test(run.subscription_fingerprint)
      || !run.subscription_fingerprint.startsWith(E2E_CHROME_FINGERPRINT)) return null;

    const targets = await deps.getTargets();
    // A truncated query can never establish global uniqueness. Fail closed at the row limit.
    if (targets.count === null || targets.rows.length !== targets.count) return null;
    const matches = targets.rows.filter((target) => deps.fingerprint(target.endpoint).startsWith(E2E_CHROME_FINGERPRINT));
    if (matches.length !== 1) return null;
    const target = matches[0];
    if (target.id !== run.subscription_id || target.user_id !== userId || target.revoked_at !== null
      || deps.fingerprint(target.endpoint) !== run.subscription_fingerprint) return null;
    if (!isPushE2EEnabled(deps.enabled()) || deps.scheduler() !== "false" || expires <= deps.now()) return null;
    // No endpoint, identity, fingerprint, or subscription credentials cross the client boundary.
    return { runId: run.id, expiresAt: run.expires_at };
  } catch {
    return null;
  }
}
