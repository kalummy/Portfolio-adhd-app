import { removeAddiOwnedStorageKeys } from "@/lib/addi-storage";

export async function clearDeletedAccountLocalData() {
  const [{ resetAnalyticsIdentity }, { clearAddiIndexedDatabase }] = await Promise.all([
    import("@/lib/analytics/mixpanel"),
    import("@/lib/indexed-db"),
  ]);
  resetAnalyticsIdentity();
  removeAddiOwnedStorageKeys(window.localStorage);
  removeAddiOwnedStorageKeys(window.sessionStorage);
  await clearAddiIndexedDatabase();
  document.documentElement.removeAttribute("data-addi-member-splash");
  document.documentElement.removeAttribute("data-addi-splash");
}
