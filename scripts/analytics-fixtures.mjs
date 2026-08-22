import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = new URL("../", import.meta.url);
const projectRootPath = fileURLToPath(projectRoot);
const fixtureDirectory = await mkdtemp(join(tmpdir(), "addi-analytics-fixtures-"));

try {
  execFileSync(join(projectRootPath, "node_modules/.bin/tsc"), [
    "--ignoreConfig",
    "--target", "es2022",
    "--module", "es2022",
    "--moduleResolution", "bundler",
    "--skipLibCheck",
    "--outDir", fixtureDirectory,
    "lib/analytics/schema.ts",
    "lib/analytics/attempts.ts",
    "lib/analytics/path-policy.ts",
  ], { cwd: projectRootPath, stdio: "pipe" });
  await copyFile(join(fixtureDirectory, "schema.js"), join(fixtureDirectory, "schema"));
  await writeFile(join(fixtureDirectory, "package.json"), '{"type":"module"}');

  const schema = await import(pathToFileURL(join(fixtureDirectory, "schema.js")));
  const attempts = await import(pathToFileURL(join(fixtureDirectory, "attempts.js")));
  const pathPolicy = await import(pathToFileURL(join(fixtureDirectory, "path-policy.js")));

  for (const pathname of ["/preview", "/preview/", "/preview/home", "/preview/home/empty"]) {
    assert.equal(pathPolicy.isAnalyticsPathBlocked(pathname), true, `${pathname} must be blocked`);
  }
  for (const pathname of [
    "/",
    "/auth/login",
    "/medications",
    "/medications/new",
    "/moods",
    "/moods/new",
    "/visits",
    "/visits/new",
    "/privacy",
    "/previewish",
  ]) {
    assert.equal(pathPolicy.isAnalyticsPathBlocked(pathname), false, `${pathname} must remain allowed`);
  }
  console.log("PASS preview analytics path blocking and normal route allowlist");

  const routeCases = [
    ["/", "home"],
    ["/?moodToast=saved#private", "home"],
    ["/auth/login?error=oauth_callback", "auth_login"],
    ["/medications", "medication_list"],
    ["/medications/new/manual/strength?origin=medications", "medication_add"],
    ["/medications/private-id", "other_safe"],
    ["/moods/new#step-4", "mood_entry"],
    ["/moods?period=1m", "mood_history"],
    ["/visits/new?date=private", "visit_add"],
    ["/visits/edit", "visit_management"],
    ["/privacy", "legal"],
    ["https://example.com/moods/new?private=1", "other_safe"],
  ];
  for (const [input, expected] of routeCases) {
    assert.equal(schema.sanitizeAnalyticsRoute(input), expected);
  }
  console.log(`PASS route sanitizer ${routeCases.length}/${routeCases.length}`);

  assert.equal(schema.ANALYTICS_EVENT_NAMES.length, 16);
  assert.deepEqual(schema.ANALYTICS_EVENT_NAMES, [
    "app_opened",
    "login_started",
    "login_completed",
    "medication_add_started",
    "medication_added",
    "medication_taken",
    "mood_started",
    "mood_step_completed",
    "mood_result_viewed",
    "mood_saved",
    "visit_add_started",
    "visit_added",
    "home_date_picker_opened",
    "home_date_selected",
    "home_date_today_clicked",
    "home_date_change_confirmed",
  ]);

  const common = {
    environment: "development",
    pathname: "/moods/new?answer=private#result",
  };
  const payload = schema.buildAnalyticsPayload({
    ...common,
    authState: "guest",
    eventName: "mood_step_completed",
    properties: {
      step: 2,
      email: "blocked@example.com",
      result: "blocked",
      medicationId: "blocked",
    },
  });
  assert.deepEqual(payload, {
    environment: "development",
    route: "mood_entry",
    auth_state: "guest",
    step: 2,
  });
  assert.equal(schema.buildAnalyticsPayload({
    ...common,
    authState: "unknown",
    eventName: "mood_saved",
    properties: {},
  }), null);
  assert.equal(schema.buildAnalyticsPayload({
    ...common,
    authState: "member",
    eventName: "app_opened",
    properties: {},
  }), null);
  assert.equal(schema.buildAnalyticsPayload({
    ...common,
    authState: "guest",
    eventName: "mood_started",
    properties: { source: "query_string" },
  }), null);
  assert.equal(schema.buildAnalyticsPayload({
    ...common,
    authState: "guest",
    eventName: "mood_step_completed",
    properties: { step: 5 },
  }), null);
  assert.deepEqual(schema.buildAnalyticsPayload({
    environment: "development",
    pathname: "/visits/new?date=private#confirm",
    authState: "guest",
    eventName: "visit_add_started",
    properties: {
      visitDate: "blocked",
      visitId: "blocked",
      hospitalName: "blocked",
      source: "blocked",
    },
  }), {
    environment: "development",
    route: "visit_add",
    auth_state: "guest",
  });
  assert.deepEqual(schema.buildAnalyticsPayload({
    environment: "production",
    pathname: "/?date=private",
    authState: "member",
    eventName: "home_date_picker_opened",
    properties: { source: "home", current_date: "2026-08-23", email: "blocked@example.com" },
  }), {
    environment: "production",
    route: "home",
    auth_state: "member",
    source: "home",
    current_date: "2026-08-23",
  });
  assert.deepEqual(schema.buildAnalyticsPayload({
    environment: "production",
    pathname: "/",
    authState: "guest",
    eventName: "home_date_selected",
    properties: {
      source: "home",
      selected_date: "2026-08-20",
      date_direction: "past",
      days_from_today: -3,
      user_id: "blocked",
    },
  }), {
    environment: "production",
    route: "home",
    auth_state: "guest",
    source: "home",
    selected_date: "2026-08-20",
    date_direction: "past",
    days_from_today: -3,
  });
  assert.deepEqual(schema.buildAnalyticsPayload({
    environment: "production",
    pathname: "/",
    authState: "member",
    eventName: "home_date_change_confirmed",
    properties: {
      source: "home",
      previous_date: "2026-08-23",
      selected_date: "2026-08-25",
      date_direction: "future",
      days_from_today: 2,
    },
  }), {
    environment: "production",
    route: "home",
    auth_state: "member",
    source: "home",
    previous_date: "2026-08-23",
    selected_date: "2026-08-25",
    date_direction: "future",
    days_from_today: 2,
  });
  assert.equal(schema.buildAnalyticsPayload({
    environment: "production",
    pathname: "/",
    authState: "guest",
    eventName: "home_date_selected",
    properties: {
      source: "home",
      selected_date: "2026-02-30",
      date_direction: "future",
      days_from_today: 1,
    },
  }), null);
  assert.equal(schema.buildAnalyticsPayload({
    environment: "production",
    pathname: "/",
    authState: "guest",
    eventName: "home_date_selected",
    properties: {
      source: "home",
      selected_date: "2026-08-23",
      date_direction: "past",
      days_from_today: 0,
    },
  }), null);
  console.log("PASS event schema and runtime property allowlist");

  let mood = attempts.createMoodAttempt("home");
  let transition = attempts.markMoodAttemptStarted(mood);
  assert.equal(transition.shouldTrack, true);
  mood = transition.state;
  assert.equal(attempts.markMoodAttemptStarted(mood).shouldTrack, false);
  for (const step of [1, 2, 3, 4]) {
    transition = attempts.markMoodStepCompleted(mood, step);
    assert.equal(transition.shouldTrack, true);
    mood = transition.state;
    assert.equal(attempts.markMoodStepCompleted(mood, step).shouldTrack, false);
  }
  transition = attempts.markMoodResultViewed(mood);
  assert.equal(transition.shouldTrack, true);
  mood = transition.state;
  assert.equal(attempts.markMoodResultViewed(mood).shouldTrack, false);
  transition = attempts.markMoodSaved(mood);
  assert.equal(transition.shouldTrack, true);
  mood = transition.state;
  assert.equal(attempts.markMoodSaved(mood).shouldTrack, false);
  assert.equal(attempts.markMoodAttemptStarted(attempts.createMoodAttempt("home")).shouldTrack, true);

  let medication = attempts.createMedicationAttempt();
  let medicationTransition = attempts.markMedicationAttemptStarted(medication);
  assert.equal(medicationTransition.shouldTrack, true);
  medication = medicationTransition.state;
  assert.equal(attempts.markMedicationAttemptStarted(medication).shouldTrack, false);
  medicationTransition = attempts.markMedicationAdded(medication);
  assert.equal(medicationTransition.shouldTrack, true);
  medication = medicationTransition.state;
  assert.equal(attempts.markMedicationAdded(medication).shouldTrack, false);

  const firstIntake = attempts.addDeduplicationKey([], "hashed-logical-record");
  assert.equal(firstIntake.shouldTrack, true);
  assert.equal(attempts.addDeduplicationKey(firstIntake.keys, "hashed-logical-record").shouldTrack, false);

  let visit = attempts.createVisitAttempt();
  let visitTransition = attempts.markVisitAttemptStarted(visit);
  assert.equal(visitTransition.shouldTrack, true);
  visit = visitTransition.state;
  assert.equal(attempts.markVisitAttemptStarted(visit).shouldTrack, false);
  visit = attempts.markVisitAttemptCompleted(visit);
  assert.equal(visit.active, false);
  assert.equal(attempts.markVisitAttemptStarted(attempts.createVisitAttempt()).shouldTrack, true);
  console.log("PASS duplicate prevention for attempts, steps, results, saves, and intake records");

  const mixpanelSource = await readFile(new URL("../lib/analytics/mixpanel.ts", import.meta.url), "utf8");
  for (const blockedProperty of [
    "$current_url",
    "$referrer",
    "$referring_domain",
    "$initial_referrer",
    "$search_engine",
    "mp_keyword",
    "utm_source",
    "initial_utm_source",
    "gclid",
  ]) {
    assert.match(mixpanelSource, new RegExp(blockedProperty.replace("$", "\\$")));
  }
  assert.match(mixpanelSource, /property_blacklist: \[\.\.\.URL_PROPERTY_BLACKLIST\]/);
  assert.match(mixpanelSource, /track_pageview: false/);
  assert.match(mixpanelSource, /record_sessions_percent: 0/);
  assert.match(mixpanelSource, /if \(isAnalyticsPathBlocked\(window\.location\.pathname\)\) return false;/);
  assert.match(mixpanelSource, /const pathname = window\.location\.pathname;\s*if \(isAnalyticsPathBlocked\(pathname\) \|\| !initAnalytics\(\)\) return false;/);
  assert.ok(mixpanelSource.indexOf("isAnalyticsPathBlocked(pathname)") < mixpanelSource.indexOf("mixpanel.track(eventName, payload)"));
  assert.match(mixpanelSource, /const tracked = trackAnalyticsEvent\("app_opened", "unknown", \{\}\);\s*if \(tracked\) analyticsState\.appOpenedTracked = true;/);
  console.log("PASS URL privacy and automatic collection configuration");

  const authScreenSource = await readFile(new URL("../components/auth-login-screen.tsx", import.meta.url), "utf8");
  const callbackSource = await readFile(new URL("../app/auth/callback/route.ts", import.meta.url), "utf8");
  const completionSource = await readFile(new URL("../components/analytics-auth-completion.tsx", import.meta.url), "utf8");
  assert.ok(authScreenSource.indexOf("trackLoginStarted()") < authScreenSource.indexOf("await signInWithGoogle"));
  assert.ok(callbackSource.indexOf("ensureUserProfile") < callbackSource.indexOf("destination.searchParams.set"));
  assert.ok(completionSource.indexOf("getAuthState()") < completionSource.indexOf("trackLoginCompleted()"));
  assert.match(completionSource, /if \(state\.isAuthenticated\) trackLoginCompleted\(\)/);
  assert.ok(completionSource.indexOf("trackLoginCompleted()") < completionSource.indexOf(".finally(removeCompletionMarker)"));
  assert.match(completionSource, /removeCompletionMarker[\s\S]*searchParams\.delete/);
  console.log("PASS login start, callback marker, member confirmation, and marker consumption order");

  const homeSource = await readFile(new URL("../components/home-screen.tsx", import.meta.url), "utf8");
  const visitSource = await readFile(new URL("../components/visit-calendar-screen.tsx", import.meta.url), "utf8");
  assert.match(homeSource, /if \(!visitSchedule\) startVisitAddAttempt\(\)/);
  assert.match(visitSource, /if \(mode !== "new"\) return;\s*ensureVisitAddAttempt\(\)/);
  assert.ok(visitSource.indexOf("await repository.saveUpcoming(selectedDate)") < visitSource.indexOf("trackVisitAdded()"));
  assert.match(visitSource, /if \(mode === "new"\) \{\s*trackVisitAdded\(\);\s*completeVisitAddAttempt\(\);/);
  console.log("PASS visit start, new-only fallback, save-success completion, and edit exclusion wiring");

  assert.ok(homeSource.indexOf("trackHomeDatePickerOpened(selectedDateKey)") < homeSource.indexOf("setCalendarOpen(true)"));
  assert.match(homeSource, /trackHomeDateSelected\(dateKey\);\s*setPendingDateKey\(dateKey\);/);
  assert.ok(homeSource.indexOf("trackHomeDateTodayClicked()") < homeSource.indexOf("setPendingDateKey(nextTodayDateKey)"));
  assert.match(homeSource, /if \(calendarConfirmHandledRef\.current\) return;\s*calendarConfirmHandledRef\.current = true;/);
  assert.match(homeSource, /if \(applied && previousDateKey !== pendingDateKey\) \{\s*trackHomeDateChangeConfirmed\(previousDateKey, pendingDateKey\);/);
  assert.match(homeSource, /onSelect=\{handleCalendarSelect\}/);
  console.log("PASS home date picker action-only wiring and unchanged-date confirmation suppression");

  console.log("analytics fixture cases: 8/8 groups passed");
} finally {
  await rm(fixtureDirectory, { recursive: true, force: true });
}
