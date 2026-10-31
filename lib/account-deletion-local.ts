import { removeAddiOwnedStorageKeys } from "@/lib/addi-storage";
import type { CleanupStep } from "./account-cleanup";

export class AccountLocalCleanupError extends Error {
  constructor(readonly failedSteps: readonly CleanupStep[]) {
    super("account_local_cleanup_pending");
    this.name = "AccountLocalCleanupError";
  }
}

export async function clearDeletedAccountLocalData() {
  const failed = new Set<CleanupStep>();
  try {
    const { resetAnalyticsSession } = await import("@/lib/analytics/events");
    resetAnalyticsSession();
    const { purgeDeletedAccountAnalytics } = await import("@/lib/analytics/mixpanel");
    if (!await purgeDeletedAccountAnalytics()) failed.add("analytics");
  } catch { failed.add("analytics"); }
  try { removeAddiOwnedStorageKeys(window.localStorage); }
  catch { failed.add("local_data"); }
  try { removeAddiOwnedStorageKeys(window.sessionStorage); }
  catch { failed.add("local_data"); }
  try {
    const { clearAddiIndexedDatabase } = await import("@/lib/indexed-db");
    await clearAddiIndexedDatabase();
  } catch { failed.add("local_data"); }
  document.documentElement.removeAttribute("data-addi-member-splash");
  document.documentElement.removeAttribute("data-addi-splash");
  if (failed.size) throw new AccountLocalCleanupError([...failed]);
}
