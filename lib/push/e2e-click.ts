export type E2EClickResult = "accepted" | "failed" | "unknown" | "blocked";

// Persist the attempt BEFORE networking. An ambiguous result never allows an automatic retry.
export function createE2EClick(deps: {
  runId: string;
  expiresAt: string;
  storage: Pick<Storage, "getItem" | "setItem">;
  fetch: typeof fetch;
  now: () => number;
}) {
  let attempted = false;
  return async (): Promise<E2EClickResult> => {
    if (attempted || !(Date.parse(deps.expiresAt) > deps.now())) return "blocked";
    attempted = true;
    try {
      const key = `addi:push-e2e-attempt:${deps.runId}`;
      if (deps.storage.getItem(key)) return "blocked";
      deps.storage.setItem(key, "attempted");
    } catch {
      return "blocked";
    }
    try {
      const response = await deps.fetch("/api/push/e2e", {
        method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: deps.runId }),
        signal: AbortSignal.timeout(30_000),
      });
      const body = await response.json();
      if (response.ok && body?.code === "provider_accepted") return "accepted";
      return "failed";
    } catch {
      return "unknown";
    }
  };
}
