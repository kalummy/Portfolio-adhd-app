import { APP_VERSION_CONFIG } from "../config/app-version";

export const ANDROID_PACKAGE_ID = "com.addi.app";
export const APP_VERSION_POLICY_PATH = "/api/app-version";
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_ID}`;
export const TWA_PLATFORM_QUERY_PARAM = "addi_platform";
export const TWA_VERSION_QUERY_PARAM = "addi_version";
export const TWA_PLATFORM_QUERY_VALUE = "android-twa";
export const TWA_VERSION_SESSION_KEY = "addi:twa-app-version:v1";

export type AppVersionPolicy = {
  currentAppVersion: string;
  minimumSupportedAppVersion: string;
  latestAppVersion: string;
};

export type AppUpdateStatus = "current" | "optional" | "required";

export type TwaRuntimeContext = {
  isTwa: boolean;
  currentAppVersion: string;
  cameFromLaunchQuery: boolean;
};

export const APP_VERSION_POLICY: AppVersionPolicy = Object.freeze({
  currentAppVersion: APP_VERSION_CONFIG.currentAppVersion,
  minimumSupportedAppVersion: APP_VERSION_CONFIG.minimumSupportedAppVersion,
  latestAppVersion: APP_VERSION_CONFIG.latestAppVersion,
});

export const CURRENT_APP_VERSION = APP_VERSION_POLICY.currentAppVersion;

export function isAppVersion(value: unknown): value is string {
  return typeof value === "string" && /^\d+\.\d+\.\d+$/.test(value);
}

export function compareAppVersions(left: string, right: string): number | null {
  if (!isAppVersion(left) || !isAppVersion(right)) return null;
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] < rightParts[index]) return -1;
    if (leftParts[index] > rightParts[index]) return 1;
  }
  return 0;
}

export function isAppVersionPolicy(value: unknown): value is AppVersionPolicy {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AppVersionPolicy>;
  if (
    !isAppVersion(candidate.currentAppVersion)
    || !isAppVersion(candidate.minimumSupportedAppVersion)
    || !isAppVersion(candidate.latestAppVersion)
  ) return false;

  return compareAppVersions(
    candidate.minimumSupportedAppVersion,
    candidate.latestAppVersion,
  ) !== 1;
}

export function getAppUpdateStatus(
  currentAppVersion: string,
  policy: AppVersionPolicy,
): AppUpdateStatus {
  if (!isAppVersionPolicy(policy)) return "current";
  const minimumComparison = compareAppVersions(
    currentAppVersion,
    policy.minimumSupportedAppVersion,
  );
  const latestComparison = compareAppVersions(currentAppVersion, policy.latestAppVersion);
  if (minimumComparison === null || latestComparison === null) return "current";
  if (minimumComparison < 0) return "required";
  if (latestComparison < 0) return "optional";
  return "current";
}

export function resolveTwaRuntimeContext(
  search: string,
  storedVersion: string | null,
): TwaRuntimeContext {
  const searchParams = new URLSearchParams(search);
  const queryVersion = searchParams.get(TWA_VERSION_QUERY_PARAM);
  if (
    searchParams.get(TWA_PLATFORM_QUERY_PARAM) === TWA_PLATFORM_QUERY_VALUE
    && isAppVersion(queryVersion)
  ) {
    return {
      isTwa: true,
      currentAppVersion: queryVersion,
      cameFromLaunchQuery: true,
    };
  }

  if (isAppVersion(storedVersion)) {
    return {
      isTwa: true,
      currentAppVersion: storedVersion,
      cameFromLaunchQuery: false,
    };
  }

  return {
    isTwa: false,
    currentAppVersion: CURRENT_APP_VERSION,
    cameFromLaunchQuery: false,
  };
}

export function isAppVersionQaHost(hostname: string) {
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || (hostname.endsWith(".vercel.app") && hostname !== "addi-gamma.vercel.app");
}

export function applyQaVersionPolicy(
  policy: AppVersionPolicy,
  search: string,
  hostname: string,
): AppVersionPolicy {
  if (!isAppVersionQaHost(hostname)) return policy;
  const searchParams = new URLSearchParams(search);
  const minimumSupportedAppVersion = searchParams.get("addi_qa_min");
  const latestAppVersion = searchParams.get("addi_qa_latest");
  const candidate = {
    ...policy,
    minimumSupportedAppVersion: minimumSupportedAppVersion ?? policy.minimumSupportedAppVersion,
    latestAppVersion: latestAppVersion ?? policy.latestAppVersion,
  };
  return isAppVersionPolicy(candidate) ? candidate : policy;
}

export async function loadAppVersionPolicy(
  fetcher: typeof fetch = fetch,
): Promise<AppVersionPolicy | null> {
  try {
    const response = await fetcher(APP_VERSION_POLICY_PATH, { cache: "no-store" });
    if (!response.ok) return null;
    const policy: unknown = await response.json();
    return isAppVersionPolicy(policy) ? policy : null;
  } catch {
    return null;
  }
}
