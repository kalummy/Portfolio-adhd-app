import type { Provider, User, UserIdentity } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  ADDI_PROFILE_METADATA_KEY,
  type AddiProfileId,
} from "@/lib/profile";
import { getSafeNextPath } from "./redirect";
import { LOGIN_COMPLETED_QUERY_KEY } from "../analytics/schema";
import {
  clearCleanupRecovery, readCleanupRecovery, writeCleanupRecovery,
  type CleanupResult, type CleanupStep,
} from "../account-cleanup";

let authBoundary = 0;
let observedAnalyticsBoundary: string | null = currentAnalyticsBoundary();
let deletionCleanup: Promise<CleanupResult> | null = null;
let deletionPendingInMemory = false;
type CleanupTask = { promise: Promise<readonly CleanupStep[]>; settled: boolean; failed: readonly CleanupStep[] };
const deletionTasks = new Map<"local_data" | "auth", CleanupTask>();
const WEB_CLEANUP_WAIT_MS = 2_000;

function currentAnalyticsBoundary(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem("addi_privacy_analytics_boundary_v1");
    if (!value) return "initial";
    const record: unknown = JSON.parse(value);
    return record && typeof record === "object" && typeof (record as { session?: unknown }).session === "string"
      ? (record as { session: string }).session : null;
  } catch { return null; }
}

export type AuthState = {
  isAuthenticated: boolean;
  user: User | null;
};

export async function getCurrentUser(): Promise<User | null> {
  const generation = authBoundary;
  const analyticsBoundary = currentAnalyticsBoundary();
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || generation !== authBoundary || analyticsBoundary !== currentAnalyticsBoundary()
    || deletionPendingInMemory || readCleanupRecovery()?.reason === "account_deletion") return null;
  return data.user;
}

export async function getAuthState(): Promise<AuthState> {
  const generation = authBoundary;
  const boundary = currentAnalyticsBoundary();
  const stillCurrent = () => generation === authBoundary
    && boundary === currentAnalyticsBoundary() && !getPendingDeletedAccountCleanup();
  const guest: AuthState = { isAuthenticated: false, user: null };
  const user = await getCurrentUser();
  if (!stillCurrent()) return guest;
  if (boundary !== observedAnalyticsBoundary) {
    try {
      const [{ resetAnalyticsSession }, { resetAnalyticsIdentity }] = await Promise.all([
        import("../analytics/events"), import("../analytics/mixpanel"),
      ]);
      if (!stillCurrent()) return guest;
      resetAnalyticsSession();
      resetAnalyticsIdentity();
    } catch { /* Analytics must not block a normal Auth result. */ }
  }
  if (!stillCurrent()) return guest;
  observedAnalyticsBoundary = boundary;
  if (user && !user.is_anonymous && typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get(LOGIN_COMPLETED_QUERY_KEY) === "1") {
    try {
      const { resumeAnalyticsAfterVerifiedSignIn } = await import("../analytics/mixpanel");
      if (!stillCurrent()) return guest;
      await resumeAnalyticsAfterVerifiedSignIn(stillCurrent);
    } catch { /* Auth success is independent from telemetry availability. */ }
  }
  return stillCurrent() ? { isAuthenticated: Boolean(user), user } : guest;
}

type MemberOAuthProvider = "google" | "kakao";

export type AddiOAuthProvider = MemberOAuthProvider;

async function signInWithProvider(provider: MemberOAuthProvider, nextPath = "/") {
  if (getPendingDeletedAccountCleanup()) throw new Error("account_cleanup_pending");
  const supabase = createBrowserSupabaseClient();
  const callbackUrl = new URL("/auth/callback", window.location.origin);
  const safeNextPath = getSafeNextPath(nextPath);
  if (safeNextPath !== "/") callbackUrl.searchParams.set("next", safeNextPath);

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: callbackUrl.toString() },
  });

  if (error) throw error;
}

export function signInWithGoogle(nextPath = "/") {
  return signInWithProvider("google", nextPath);
}

export function signInWithKakao(nextPath = "/") {
  return signInWithProvider("kakao", nextPath);
}

export async function getLinkedOAuthIdentities() {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) throw error;

  return data.identities.filter(
    (identity): identity is UserIdentity & { provider: AddiOAuthProvider } => (
      identity.provider === "google" || identity.provider === "kakao"
    ),
  );
}

export async function linkOAuthIdentity(
  provider: AddiOAuthProvider,
  nextPath = "/my/social-login",
) {
  const supabase = createBrowserSupabaseClient();
  const callbackUrl = new URL("/auth/callback", window.location.origin);
  const safeNextPath = getSafeNextPath(nextPath);
  callbackUrl.searchParams.set("next", safeNextPath);

  const { error } = await supabase.auth.linkIdentity({
    provider: provider as Provider,
    options: { redirectTo: callbackUrl.toString() },
  });
  if (error) throw error;
}

export async function unlinkOAuthIdentity(provider: AddiOAuthProvider) {
  const supabase = createBrowserSupabaseClient();
  const identities = await getLinkedOAuthIdentities();
  if (identities.length <= 1) throw new Error("last_identity");

  const identity = identities.find((candidate) => candidate.provider === provider);
  if (!identity) throw new Error("identity_not_found");

  const { error } = await supabase.auth.unlinkIdentity(identity);
  if (error) throw error;
}

export async function updateAddiProfile(profileId: AddiProfileId) {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.auth.updateUser({
    data: { [ADDI_PROFILE_METADATA_KEY]: profileId },
  });
  if (error) throw error;
  window.dispatchEvent(new CustomEvent("addi:profile-changed", { detail: { profileId } }));
  return data.user;
}

export async function signOut() {
  authBoundary++;
  try {
    const [{ resetAnalyticsSession }, analytics] = await Promise.all([
      import("../analytics/events"), import("../analytics/mixpanel"),
    ]);
    analytics.advanceAnalyticsLogoutBoundary();
    observedAnalyticsBoundary = currentAnalyticsBoundary();
    resetAnalyticsSession();
    analytics.resetAnalyticsIdentity();
  } catch { /* Even a failed analytics import/reset must not skip Auth logout. */ }
  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function clearDeletedAccountSession() {
  authBoundary++;
  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw error;
}

export function getPendingDeletedAccountCleanup(): boolean {
  return deletionPendingInMemory || readCleanupRecovery()?.reason === "account_deletion";
}

/** Local-only after the caller has confirmed server DELETE. Never sends DELETE. */
export function completeDeletedAccountCleanup(): Promise<CleanupResult> {
  return performDeletedAccountCleanup();
}

/** A recovery hint is not server proof: retry performs local/session cleanup only. */
export function retryDeletedAccountCleanup(): Promise<CleanupResult> {
  if (!getPendingDeletedAccountCleanup()) return Promise.resolve({ status: "complete", failedSteps: [] });
  return performDeletedAccountCleanup();
}

function cleanupTask(
  name: "local_data" | "auth",
  run: () => Promise<void>,
): CleanupTask {
  const previous = deletionTasks.get(name);
  if (previous && (!previous.settled || !previous.failed.length)) return previous;
  const task: CleanupTask = { promise: Promise.resolve([]), settled: false, failed: [] };
  task.promise = run().then(() => [] as CleanupStep[], (error: unknown) => {
    if (name === "local_data" && error && typeof error === "object") {
      const steps = (error as { failedSteps?: unknown }).failedSteps;
      if (Array.isArray(steps)) {
        const allowed = steps.filter((step): step is "analytics" | "local_data" => (
          step === "analytics" || step === "local_data"
        ));
        if (allowed.length) return allowed;
      }
    }
    return [name];
  }).then((failed) => { task.settled = true; task.failed = failed; return failed; });
  deletionTasks.set(name, task);
  return task;
}

function performDeletedAccountCleanup(): Promise<CleanupResult> {
  if (deletionCleanup) return deletionCleanup;
  if (!getPendingDeletedAccountCleanup()) deletionTasks.clear();
  deletionPendingInMemory = true;
  authBoundary++;
  const failed = new Set<CleanupStep>();
  if (!writeCleanupRecovery("account_deletion")) failed.add("recovery");
  const operation = (async (): Promise<CleanupResult> => {
    const tasks = [
      cleanupTask("local_data", async () => {
        const { clearDeletedAccountLocalData } = await import("../account-deletion-local");
        await clearDeletedAccountLocalData();
      }),
      cleanupTask("auth", clearDeletedAccountSession),
    ];
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all(tasks.map((task) => task.promise)),
        new Promise<void>((resolve) => { timeout = setTimeout(resolve, WEB_CLEANUP_WAIT_MS); }),
      ]);
    } finally { if (timeout) clearTimeout(timeout); }
    for (let index = 0; index < tasks.length; index++) {
      const task = tasks[index];
      if (!task.settled) failed.add(index === 0 ? "local_data" : "auth");
      else for (const step of task.failed) failed.add(step);
    }
    if (!failed.size && !clearCleanupRecovery()) failed.add("recovery");
    if (!failed.size) {
      deletionPendingInMemory = false;
      deletionTasks.clear();
    }
    return { status: failed.size ? "pending" : "complete", failedSteps: [...failed] };
  })();
  deletionCleanup = operation;
  return operation.finally(() => { deletionCleanup = null; });
}
