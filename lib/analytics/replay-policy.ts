export const ANALYTICS_REPLAY_ALLOWED_PATHS = [
  "/",
  "/moods/new",
  "/moods",
] as const;

export const ANALYTICS_REPLAY_SAMPLE_STORAGE_KEY =
  "addi:analytics-replay-sample:v1";

export const ANALYTICS_REPLAY_POLICY_CHANGE_EVENT =
  "addi:analytics-replay-policy-change";

export const ANALYTICS_REPLAY_INTERACTION_BLOCK_EVENT =
  "addi:analytics-replay-interaction-block";

export const ANALYTICS_REPLAY_ALLOW_INTERACTION_SELECTOR =
  "[data-mp-replay-allow-interaction]";

export const ANALYTICS_REPLAY_BLOCK_SELECTOR =
  "[data-mp-replay-block]";

export const ANALYTICS_REPLAY_PAUSE_SELECTOR =
  "[data-mp-replay-pause]";

export type ReplayRuntimeEnvironment =
  | "production"
  | "preview"
  | "development"
  | "unknown";

export function normalizeReplayRuntimeEnvironment(
  value: string | undefined,
): ReplayRuntimeEnvironment {
  if (value === "production" || value === "preview" || value === "development") {
    return value;
  }
  return "unknown";
}

export function isReplayRouteAllowed(pathname: string) {
  return ANALYTICS_REPLAY_ALLOWED_PATHS.includes(
    pathname as (typeof ANALYTICS_REPLAY_ALLOWED_PATHS)[number],
  );
}

export function isReplayUrlPrivacySafe({
  hash,
  pathname,
  search,
}: {
  hash: string;
  pathname: string;
  search: string;
}) {
  return isReplayRouteAllowed(pathname) && search === "" && hash === "";
}

export function shouldCanonicalizeMoodReplayUrl({
  hash,
  pathname,
  search,
}: {
  hash: string;
  pathname: string;
  search: string;
}) {
  if (pathname !== "/moods/new" || hash !== "") return false;
  const params = new URLSearchParams(search);
  const keys = Array.from(params.keys());
  return keys.length === 1
    && keys[0] === "date"
    && /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "");
}

export function getReplaySamplePercent({
  qaMode,
  runtimeEnvironment,
}: {
  qaMode: boolean;
  runtimeEnvironment: ReplayRuntimeEnvironment;
}) {
  if (runtimeEnvironment === "production") return 1;
  if (isPreviewReplayQaEnabled({ qaMode, runtimeEnvironment })) return 100;
  return 0;
}

export function isPreviewReplayQaEnabled({
  qaMode,
  runtimeEnvironment,
}: {
  qaMode: boolean;
  runtimeEnvironment: ReplayRuntimeEnvironment;
}) {
  return qaMode && runtimeEnvironment === "preview";
}

export function isReplaySampleIncluded(
  samplePercent: number,
  randomValue: number,
) {
  if (samplePercent <= 0) return false;
  if (samplePercent >= 100) return true;
  return randomValue >= 0
    && randomValue < 1
    && randomValue < samplePercent / 100;
}

export function shouldStartReplay({
  consentGranted,
  interactionSuspended,
  sampleIncluded,
  surfacePaused,
  urlPrivacySafe,
}: {
  consentGranted: boolean;
  interactionSuspended: boolean;
  sampleIncluded: boolean;
  surfacePaused: boolean;
  urlPrivacySafe: boolean;
}) {
  return consentGranted
    && sampleIncluded
    && urlPrivacySafe
    && !surfacePaused
    && !interactionSuspended;
}
