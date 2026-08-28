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
    "--rootDir", "lib",
    "lib/analytics/schema.ts",
    "lib/analytics/attempts.ts",
    "lib/analytics/path-policy.ts",
    "lib/analytics/screens.ts",
  ], { cwd: projectRootPath, stdio: "pipe" });
  for (const name of ["analytics/schema", "analytics/screens", "analytics/mood-contract", "analytics/medication-contract", "cats"]) {
    await copyFile(join(fixtureDirectory, `${name}.js`), join(fixtureDirectory, name));
  }
  await writeFile(join(fixtureDirectory, "package.json"), '{"type":"module"}');

  const schema = await import(pathToFileURL(join(fixtureDirectory, "analytics/schema.js")));
  const attempts = await import(pathToFileURL(join(fixtureDirectory, "analytics/attempts.js")));
  const pathPolicy = await import(pathToFileURL(join(fixtureDirectory, "analytics/path-policy.js")));
  const screens = await import(pathToFileURL(join(fixtureDirectory, "analytics/screens.js")));
  const moodContext = { mood_attempt_id: "23c0c37b-4871-46a7-b44c-f7d39045fe0b", flow_version: "mood_v2_instrumented" };
  const medicationContext = { medication_attempt_id: "23c0c37b-4871-46a7-b44c-f7d39045fe0b", flow_version: "medication_registration_v2_instrumented" };

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

  assert.equal(schema.ANALYTICS_EVENT_NAMES.length, 34);
  assert.deepEqual(schema.ANALYTICS_EVENT_NAMES, [
    "app_opened",
    "screen_viewed",
    "login_started",
    "login_completed",
    "medication_add_started",
    "medication_added",
    "medication_registration_step_viewed",
    "medication_save_clicked",
    "medication_registration_failed",
    "medication_taken",
    "medication_management_opened",
    "medication_schedule_edit_opened",
    "medication_schedule_updated",
    "medication_delete_confirmed",
    "mood_started",
    "mood_step_completed",
    "mood_result_viewed",
    "mood_completed",
    "cat_reward_revealed",
    "cat_collection_viewed",
    "mood_report_viewed",
    "mood_analysis_retried",
    "mood_saved",
    "mood_analysis_started",
    "mood_analysis_succeeded",
    "mood_analysis_failed",
    "mood_save_clicked",
    "mood_save_failed",
    "visit_add_started",
    "visit_added",
    "home_date_picker_opened",
    "home_date_selected",
    "home_date_today_clicked",
    "home_date_change_confirmed",
  ]);

  const screenCases = [
    ["/", "home"],
    ["/?date=2026-08-23", "home"],
    ["/auth/login", "account"],
    ["/medications", "medication_management"],
    ["/medications/private-medication-id/schedule?date=private", "medication_schedule_edit"],
    ["/medications/new/search?date=private", "medication_registration"],
    ["/medications/new/manual/strength", "medication_registration"],
    ["/moods/new?date=private", "mood_create"],
    ["/moods", "mood_history"],
    ["/visits", "visit"],
    ["/visits/new?date=private", "visit"],
    ["/visits/edit", "visit"],
    ["/terms", "legal"],
    ["/privacy", "legal"],
    ["/preview/home", null],
    ["/unknown/private-id", null],
  ];
  for (const [input, expected] of screenCases) {
    assert.equal(screens.screenNameForPath(input), expected);
  }

  let screenState = null;
  const screenEvents = [];
  for (const pathname of [
    "/",
    "/?date=2026-08-23",
    "/medications",
    "/medications",
    "/medications/private-id/schedule?date=private",
    "/medications",
    "/",
    "/moods/new?date=private",
  ]) {
    const transition = screens.createScreenViewTransition(screenState, pathname);
    screenState = transition.currentScreen;
    if (transition.properties) screenEvents.push(transition.properties);
  }
  assert.deepEqual(screenEvents, [
    { screen_name: "home", navigation_type: "initial" },
    {
      screen_name: "medication_management",
      previous_screen: "home",
      navigation_type: "route_change",
    },
    {
      screen_name: "medication_schedule_edit",
      previous_screen: "medication_management",
      navigation_type: "route_change",
    },
    {
      screen_name: "medication_management",
      previous_screen: "medication_schedule_edit",
      navigation_type: "route_change",
    },
    {
      screen_name: "home",
      previous_screen: "medication_management",
      navigation_type: "route_change",
    },
    {
      screen_name: "mood_create",
      previous_screen: "home",
      navigation_type: "route_change",
    },
  ]);
  console.log(`PASS screen allowlist ${screenCases.length}/${screenCases.length} and navigation deduplication`);

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
      ...moodContext,
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
    ...moodContext,
  });
  assert.deepEqual(schema.buildAnalyticsPayload({
    environment: "production",
    pathname: "/medications/private-medication-id/schedule?date=private",
    authState: "member",
    eventName: "screen_viewed",
    properties: {
      screen_name: "medication_schedule_edit",
      previous_screen: "medication_management",
      navigation_type: "route_change",
      medicationId: "blocked",
      medication_name: "blocked",
      dosage: "blocked",
      scheduledTime: "blocked",
      selected_date: "blocked",
      user_id: "blocked",
      email: "blocked@example.com",
      query: "blocked",
    },
  }), {
    environment: "production",
    route: "other_safe",
    auth_state: "member",
    screen_name: "medication_schedule_edit",
    previous_screen: "medication_management",
    navigation_type: "route_change",
  });
  assert.equal(schema.buildAnalyticsPayload({
    environment: "production",
    pathname: "/",
    authState: "guest",
    eventName: "screen_viewed",
    properties: {
      screen_name: "invented_screen",
      navigation_type: "initial",
    },
  }), null);
  assert.equal(schema.buildAnalyticsPayload({
    environment: "production",
    pathname: "/",
    authState: "guest",
    eventName: "screen_viewed",
    properties: {
      screen_name: "home",
      previous_screen: "home",
      navigation_type: "route_change",
    },
  }), null);
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
    properties: { ...moodContext, step: 5 },
  }), null);
  assert.deepEqual(schema.buildAnalyticsPayload({
    environment: "development",
    pathname: "/moods/new",
    authState: "guest",
    eventName: "cat_reward_revealed",
    properties: {
      cat_id: "white",
      ...moodContext,
      mood_answer: "blocked",
      direct_input: "blocked",
      ai_result: "blocked",
      medication_name: "blocked",
      email: "blocked@example.com",
      name: "blocked",
    },
  }), {
    environment: "development",
    route: "mood_entry",
    auth_state: "guest",
    cat_id: "white",
    ...moodContext,
  });
  assert.equal(schema.buildAnalyticsPayload({
    ...common,
    authState: "guest",
    eventName: "cat_reward_revealed",
    properties: { ...moodContext, cat_id: "unknown" },
  }), null);
  assert.deepEqual(schema.buildAnalyticsPayload({
    environment: "development",
    pathname: "/moods",
    authState: "member",
    eventName: "cat_collection_viewed",
    properties: {
      cat_id: "white",
      mood_date: "blocked",
      answer: "blocked",
      ai_result: "blocked",
    },
  }), {
    environment: "development",
    route: "mood_history",
    auth_state: "member",
  });
  assert.deepEqual(schema.buildAnalyticsPayload({
    environment: "development",
    pathname: "/moods?month=blocked",
    authState: "member",
    eventName: "mood_report_viewed",
    properties: {
      month: "blocked",
      count: 12,
      mood_answer: "blocked",
      ai_result: "blocked",
      medication_name: "blocked",
    },
  }), {
    environment: "development",
    route: "mood_history",
    auth_state: "member",
  });
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

  assert.deepEqual(schema.buildAnalyticsPayload({
    environment: "production",
    pathname: "/",
    authState: "member",
    eventName: "medication_management_opened",
    properties: {
      source: "home",
      medication_count: 2,
      medication_id: "blocked",
      medication_name: "blocked",
      user_id: "blocked",
    },
  }), {
    environment: "production",
    route: "home",
    auth_state: "member",
    source: "home",
    medication_count: 2,
  });
  assert.equal(schema.buildAnalyticsPayload({
    environment: "production",
    pathname: "/",
    authState: "guest",
    eventName: "medication_management_opened",
    properties: { source: "home", medication_count: -1 },
  }), null);

  assert.deepEqual(schema.buildAnalyticsPayload({
    environment: "development",
    pathname: "/medications",
    authState: "guest",
    eventName: "medication_schedule_edit_opened",
    properties: {
      source: "medication_management",
      schedule_type: "as_needed",
      has_scheduled_time: true,
      scheduledTime: "09:30",
      dosage: "blocked",
    },
  }), {
    environment: "development",
    route: "medication_list",
    auth_state: "guest",
    source: "medication_management",
    schedule_type: "as_needed",
    has_scheduled_time: true,
  });

  for (const changedFields of ["schedule", "time", "schedule_and_time"]) {
    assert.deepEqual(schema.buildAnalyticsPayload({
      environment: "development",
      pathname: "/medications/private-id/schedule",
      authState: "guest",
      eventName: "medication_schedule_updated",
      properties: {
        source: "medication_management",
        changed_fields: changedFields,
        previous_schedule_type: "daily",
        new_schedule_type: "bedtime",
        had_scheduled_time_before: true,
        has_scheduled_time_after: false,
        previous_time: "09:30",
        new_time: "10:30",
        email: "blocked@example.com",
      },
    }), {
      environment: "development",
      route: "other_safe",
      auth_state: "guest",
      source: "medication_management",
      changed_fields: changedFields,
      previous_schedule_type: "daily",
      new_schedule_type: "bedtime",
      had_scheduled_time_before: true,
      has_scheduled_time_after: false,
    });
  }
  assert.equal(schema.buildAnalyticsPayload({
    environment: "development",
    pathname: "/medications/private-id/schedule",
    authState: "guest",
    eventName: "medication_schedule_updated",
    properties: {
      source: "medication_management",
      changed_fields: "none",
      previous_schedule_type: "daily",
      new_schedule_type: "daily",
      had_scheduled_time_before: true,
      has_scheduled_time_after: true,
    },
  }), null);

  assert.deepEqual(schema.buildAnalyticsPayload({
    environment: "development",
    pathname: "/medications",
    authState: "member",
    eventName: "medication_delete_confirmed",
    properties: {
      source: "medication_management",
      has_intake_history: true,
      medicationId: "blocked",
      intake_recorded_at: "blocked",
    },
  }), {
    environment: "development",
    route: "medication_list",
    auth_state: "member",
    source: "medication_management",
    has_intake_history: true,
  });
  assert.deepEqual(schema.buildAnalyticsPayload({
    environment: "development",
    pathname: "/medications",
    authState: "guest",
    eventName: "medication_add_started",
    properties: { ...medicationContext, source: "medication_management", medication_name: "blocked" },
  }), {
    ...medicationContext,
    environment: "development",
    route: "medication_list",
    auth_state: "guest",
    source: "medication_management",
  });
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
  assert.match(mixpanelSource, /const currentPathname = window\.location\.pathname;\s*const pathname = pathnameOverride \?\? currentPathname;/);
  assert.match(mixpanelSource, /isAnalyticsPathBlocked\(currentPathname\)[\s\S]*?isAnalyticsPathBlocked\(pathname\)[\s\S]*?!initAnalytics\(\)/);
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

  const medicationListSource = await readFile(new URL("../app/medications/page.tsx", import.meta.url), "utf8");
  const medicationEditorSource = await readFile(new URL("../components/medication-schedule-editor.tsx", import.meta.url), "utf8");
  const analyticsEventsSource = await readFile(new URL("../lib/analytics/events.ts", import.meta.url), "utf8");
  const screenTrackerSource = await readFile(new URL("../components/analytics-screen-tracker.tsx", import.meta.url), "utf8");
  const layoutSource = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");

  assert.match(screenTrackerSource, /useEffect\(\(\) => \{\s*trackScreenViewed\(pathname\);\s*\}, \[pathname\]\)/);
  assert.match(layoutSource, /<Suspense fallback=\{null\}>\s*<AnalyticsScreenTracker \/>\s*<\/Suspense>/);
  assert.match(analyticsEventsSource, /if \(typeof window === "undefined" \|\| isAnalyticsPathBlocked\(pathname\)\) return;/);
  assert.match(analyticsEventsSource, /createScreenViewTransition\(screenTrackingState\.previousScreen, pathname\)/);
  assert.ok(
    analyticsEventsSource.indexOf("isAnalyticsPathBlocked(pathname)")
      < analyticsEventsSource.indexOf("createScreenViewTransition(screenTrackingState.previousScreen, pathname)"),
  );
  console.log("PASS screen tracker route-only wiring, preview blocking, and Strict Mode deduplication state");

  assert.match(analyticsEventsSource, /if \(typeof window === "undefined" \|\| isAnalyticsPathBlocked\(window\.location\.pathname\)\) \{\s*return Promise\.resolve\(\);/);
  assert.ok(
    analyticsEventsSource.indexOf("isAnalyticsPathBlocked(window.location.pathname)")
      < analyticsEventsSource.indexOf("analyticsQueue = analyticsQueue"),
  );
  assert.match(homeSource, /onNavigate=\{\(\) => trackMedicationManagementOpened\(activeMedicationCount\)\}/);
  assert.match(analyticsEventsSource, /now - lastMedicationManagementOpenAt < START_THROTTLE_MS/);
  assert.match(medicationListSource, /onNavigate=\{\(\) => trackMedicationScheduleEditOpened\([\s\S]*?medication\.schedule,[\s\S]*?Boolean\(medication\.scheduledTime\)/);
  assert.match(medicationListSource, /startMedicationAddAttempt\("medication_management", targetDate\)/);
  assert.ok(
    medicationListSource.indexOf("await repositories.medications.deactivate")
      < medicationListSource.indexOf("trackMedicationDeleteConfirmed(deleteTarget.hasIntakeHistory)"),
  );
  assert.equal((medicationListSource.match(/trackMedicationDeleteConfirmed\(/g) ?? []).length, 1);

  const noChangeReturnIndex = medicationEditorSource.indexOf("if (!timeChanged)");
  const updateIndex = medicationEditorSource.indexOf("await repository.updateRecordedAt");
  const rereadIndex = medicationEditorSource.indexOf("await repository.listByDate(targetDateKey)");
  const verificationIndex = medicationEditorSource.indexOf("persistedMatches.length !== 1");
  assert.ok(noChangeReturnIndex < updateIndex);
  assert.ok(updateIndex < rereadIndex);
  assert.ok(rereadIndex < verificationIndex);
  assert.equal((medicationEditorSource.match(/trackMedicationScheduleUpdated\(/g) ?? []).length, 0);
  assert.doesNotMatch(medicationEditorSource, /scheduledTime/);
  console.log("PASS medication recordedAt persistence and schedule-update analytics separation wiring");

  console.log("analytics fixture cases: 11/11 groups passed");
} finally {
  await rm(fixtureDirectory, { recursive: true, force: true });
}
