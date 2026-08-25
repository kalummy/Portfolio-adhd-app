import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  denyAnalyticsConsent,
  grantAnalyticsConsent,
  readAnalyticsConsent,
  withdrawAnalyticsConsent,
} from "../lib/analytics/consent.ts";
import {
  getReplaySamplePercent,
  isPreviewReplayQaEnabled,
  isReplayRouteAllowed,
  isReplaySampleIncluded,
  isReplayUrlPrivacySafe,
  normalizeReplayRuntimeEnvironment,
  shouldCanonicalizeMoodReplayUrl,
  shouldStartReplay,
} from "../lib/analytics/replay-policy.ts";

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }
}

const storage = new MemoryStorage();
assert.equal(readAnalyticsConsent(storage), "unset");
assert.equal(grantAnalyticsConsent(storage), true);
assert.equal(storage.getItem(ANALYTICS_CONSENT_STORAGE_KEY), "granted");
assert.equal(readAnalyticsConsent(storage), "granted");
assert.equal(denyAnalyticsConsent(storage), true);
assert.equal(readAnalyticsConsent(storage), "denied");
assert.equal(grantAnalyticsConsent(storage), true);
assert.equal(withdrawAnalyticsConsent(storage), true);
assert.equal(readAnalyticsConsent(storage), "denied");
console.log("PASS Replay consent defaults off and grant, deny, withdrawal persist safely");

for (const pathname of ["/", "/moods/new", "/moods"]) {
  assert.equal(isReplayRouteAllowed(pathname), true);
  assert.equal(isReplayUrlPrivacySafe({ pathname, search: "", hash: "" }), true);
}
for (const pathname of [
  "/moods/2026-08-25",
  "/medications",
  "/visits",
  "/auth/login",
  "/preview",
]) {
  assert.equal(isReplayRouteAllowed(pathname), false);
}
assert.equal(isReplayUrlPrivacySafe({ pathname: "/", search: "?date=2026-08-25", hash: "" }), false);
assert.equal(isReplayUrlPrivacySafe({ pathname: "/moods", search: "?deleted=1", hash: "" }), false);
assert.equal(isReplayUrlPrivacySafe({ pathname: "/moods/new", search: "", hash: "#private" }), false);
assert.equal(shouldCanonicalizeMoodReplayUrl({ pathname: "/moods/new", search: "?date=2026-08-25", hash: "" }), true);
for (const location of [
  { pathname: "/", search: "?date=2026-08-25", hash: "" },
  { pathname: "/moods/new", search: "?date=2026-08-25&private=1", hash: "" },
  { pathname: "/moods/new", search: "?date=not-a-date", hash: "" },
  { pathname: "/moods/new", search: "?date=2026-08-25", hash: "#private" },
]) assert.equal(shouldCanonicalizeMoodReplayUrl(location), false);
console.log("PASS Replay exact-route allowlist and canonical URL-only policy");

assert.equal(normalizeReplayRuntimeEnvironment("production"), "production");
assert.equal(normalizeReplayRuntimeEnvironment("preview"), "preview");
assert.equal(normalizeReplayRuntimeEnvironment(undefined), "unknown");
assert.equal(getReplaySamplePercent({ runtimeEnvironment: "production", qaMode: false }), 1);
assert.equal(getReplaySamplePercent({ runtimeEnvironment: "production", qaMode: true }), 1);
assert.equal(getReplaySamplePercent({ runtimeEnvironment: "preview", qaMode: false }), 0);
assert.equal(getReplaySamplePercent({ runtimeEnvironment: "preview", qaMode: true }), 100);
assert.equal(getReplaySamplePercent({ runtimeEnvironment: "development", qaMode: true }), 0);
assert.equal(getReplaySamplePercent({ runtimeEnvironment: "unknown", qaMode: true }), 0);
assert.equal(isPreviewReplayQaEnabled({ runtimeEnvironment: "preview", qaMode: true }), true);
assert.equal(isPreviewReplayQaEnabled({ runtimeEnvironment: "production", qaMode: true }), false);
assert.equal(isPreviewReplayQaEnabled({ runtimeEnvironment: "development", qaMode: true }), false);
assert.equal(isReplaySampleIncluded(1, 0), true);
assert.equal(isReplaySampleIncluded(1, 0.0099), true);
assert.equal(isReplaySampleIncluded(1, 0.01), false);
assert.equal(isReplaySampleIncluded(100, 0.999), true);
assert.equal(isReplaySampleIncluded(0, 0), false);
console.log("PASS Production 1 percent and explicit Preview-only QA 100 percent sampling");

const eligiblePolicy = {
  consentGranted: true,
  interactionSuspended: false,
  sampleIncluded: true,
  surfacePaused: false,
  urlPrivacySafe: true,
};
assert.equal(shouldStartReplay(eligiblePolicy), true);
for (const key of ["consentGranted", "sampleIncluded", "urlPrivacySafe"]) {
  assert.equal(shouldStartReplay({ ...eligiblePolicy, [key]: false }), false, key);
}
assert.equal(shouldStartReplay({ ...eligiblePolicy, interactionSuspended: true }), false);
assert.equal(shouldStartReplay({ ...eligiblePolicy, surfacePaused: true }), false);
console.log("PASS Replay start requires every privacy gate and stops on pause or interaction guard");

const sources = Object.fromEntries(await Promise.all([
  "../instrumentation-client.ts",
  "../lib/analytics/mixpanel.ts",
  "../components/analytics-replay-controller.tsx",
  "../components/home-screen.tsx",
  "../components/mood-question-flow.tsx",
  "../components/mood-result.tsx",
  "../components/mood-history.tsx",
  "../components/mood-monthly-report.tsx",
  "../components/mood-cat-collection.tsx",
].map(async (relativePath) => [
  relativePath,
  await readFile(new URL(relativePath, import.meta.url), "utf8"),
])));

const mixpanelSource = sources["../lib/analytics/mixpanel.ts"];
assert.match(mixpanelSource, /mixpanel-with-async-modules\.cjs\.js/);
assert.doesNotMatch(mixpanelSource, /loader-module-core/);
assert.match(mixpanelSource, /autocapture: false/);
assert.match(mixpanelSource, /record_sessions_percent: 0/);
assert.match(mixpanelSource, /record_heatmap_data: true/);
assert.match(mixpanelSource, /pause_session_recording/);
assert.match(mixpanelSource, /resume_session_recording/);
assert.match(mixpanelSource, /set_config\(\{ record_heatmap_data: false \}\)/);
assert.match(mixpanelSource, /record_mask_all_text: true/);
assert.match(mixpanelSource, /record_mask_all_inputs: true/);
assert.match(mixpanelSource, /record_console: false/);
assert.match(mixpanelSource, /record_network: false/);
assert.match(mixpanelSource, /record_canvas: false/);
assert.match(mixpanelSource, /current_url_search/);
assert.match(mixpanelSource, /sanitizeHeatmapEvent/);
assert.match(mixpanelSource, /delete properties\.\$el_attr__href/);
assert.match(mixpanelSource, /delete element\["\$attr-href"\]/);
assert.match(mixpanelSource, /data-mp-replay-public/);
assert.match(mixpanelSource, /ANALYTICS_REPLAY_BLOCK_SELECTOR/);
assert.match(mixpanelSource, /send_immediately: true/);
assert.match(mixpanelSource, /transport: "xhr"/);
assert.match(mixpanelSource, /timeout_ms: IMMEDIATE_DELIVERY_TIMEOUT_MS/);

const instrumentationSource = sources["../instrumentation-client.ts"];
assert.ok(
  instrumentationSource.indexOf("installAnalyticsReplayInteractionGuard()")
    < instrumentationSource.indexOf("initAnalytics()"),
);
assert.match(instrumentationSource, /onRouterTransitionStart[\s\S]*stopAnalyticsReplay/);

const controllerSource = sources["../components/analytics-replay-controller.tsx"];
assert.match(controllerSource, /previewReplayQaEnabled \|\| readAnalyticsConsent\(\) === "granted"/);
assert.match(controllerSource, /NEXT_PUBLIC_VERCEL_ENV/);
assert.match(controllerSource, /NEXT_PUBLIC_MIXPANEL_REPLAY_QA/);
assert.match(controllerSource, /window\.location\.search/);
assert.match(controllerSource, /window\.history\.replaceState\(window\.history\.state, "", pathname\)/);
assert.match(controllerSource, /stopAnalyticsReplay\(\)/);

const homeSource = sources["../components/home-screen.tsx"];
for (const sensitiveClass of [
  "week-strip",
  "appointment-row",
  "date-heading",
  "empty-medication-card",
  "populated-medication-card",
  "recorded-mood-item",
  "mood-diary-card",
]) {
  const index = homeSource.indexOf(sensitiveClass);
  assert.notEqual(index, -1, sensitiveClass);
  assert.match(homeSource.slice(index, index + 500), /data-mp-replay-block/);
}
assert.match(homeSource, /mood-history-link[\s\S]{0,400}data-mp-replay-allow-interaction/);
assert.match(homeSource, /mood-record-link[\s\S]{0,400}data-mp-replay-allow-interaction/);

const questionSource = sources["../components/mood-question-flow.tsx"];
assert.match(questionSource, /mood-question-options[\s\S]{0,300}data-mp-replay-block/);
assert.match(questionSource, /goToNextStep[\s\S]{0,300}data-mp-replay-allow-interaction/);
assert.ok(questionSource.indexOf("await trackMoodSaved()") < questionSource.indexOf("stopAnalyticsReplay()"));

const resultSource = sources["../components/mood-result.tsx"];
assert.match(resultSource, /mood-result-content[^>]*data-mp-replay-block/);
assert.match(resultSource, /onClick=\{onSave\}[\s\S]{0,200}data-mp-replay-allow-interaction/);

const historySource = sources["../components/mood-history.tsx"];
assert.match(historySource, /mood-record-tabs[\s\S]{0,900}data-mp-replay-allow-interaction/);
assert.match(historySource, /mood-record-list[\s\S]{0,300}data-mp-replay-block/);
assert.match(historySource, /mood-history-period-options[\s\S]{0,900}data-mp-replay-allow-interaction/);

const reportSource = sources["../components/mood-monthly-report.tsx"];
for (const sensitiveClass of ["mood-report-summary", "mood-report-patterns", "mood-report-clinic"]) {
  const index = reportSource.indexOf(sensitiveClass);
  assert.notEqual(index, -1, sensitiveClass);
  assert.match(reportSource.slice(index, index + 500), /data-mp-replay-block/);
}
assert.match(reportSource, /mood-report-month-select[\s\S]{0,400}data-mp-replay-allow-interaction/);
assert.match(reportSource, /mood-report-reset[\s\S]{0,300}data-mp-replay-allow-interaction/);
assert.match(reportSource, /mood-report-confirm[\s\S]{0,300}data-mp-replay-allow-interaction/);

const collectionSource = sources["../components/mood-cat-collection.tsx"];
assert.match(collectionSource, /mood-cat-collection-grid[^>]*data-mp-replay-block/);
console.log("PASS source-level loader, privacy defaults, route controller, block markers, and UX allowlist");

console.log("replay privacy fixture cases: 6/6 groups passed");
