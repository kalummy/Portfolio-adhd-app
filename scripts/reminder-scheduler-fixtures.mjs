import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getActiveReminderWindow,
  getActiveReminderWindows,
  getReminderContent,
  isReminderSchedulerEnabled,
} from "../lib/reminders/policy.ts";
import { runReminderScheduler } from "../lib/reminders/scheduler.ts";
import { isPublicRequestPath } from "../lib/auth/routes.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const slotCases = [
  ["2026-08-31T00:00:00.000Z", "medication_0900"],
  ["2026-08-31T02:00:00.000Z", "daily_1100"],
  ["2026-08-31T04:00:00.000Z", "daily_1300"],
  ["2026-08-31T06:00:00.000Z", "mood_1500"],
  ["2026-08-31T12:00:00.000Z", "bedtime_2100"],
];
for (const [instant, expectedSlot] of slotCases) {
  const window = getActiveReminderWindow(new Date(instant));
  assert.equal(window?.slotKey, expectedSlot);
  assert.equal(window?.localDate, "2026-08-31");
}
assert.deepEqual(
  getActiveReminderWindows(new Date("2026-08-30T23:00:00.000Z")).map(({ slotKey }) => slotKey),
  ["visit_day_before_0800", "visit_day_today_0800"],
);
assert.deepEqual(
  getActiveReminderWindows(new Date("2026-08-30T23:29:59.999Z")).map(({ slotKey }) => slotKey),
  ["visit_day_before_0800", "visit_day_today_0800"],
);
assert.deepEqual(
  getActiveReminderWindows(new Date("2026-08-30T23:30:00.000Z")),
  [],
);
assert.equal(
  getActiveReminderWindow(new Date("2026-08-31T00:29:59.999Z"))?.slotKey,
  "medication_0900",
);
assert.equal(getActiveReminderWindow(new Date("2026-08-31T00:30:00.000Z")), null);
assert.equal(getActiveReminderWindow(new Date("2026-08-30T15:00:00.000Z")), null);
assert.equal(
  getActiveReminderWindow(new Date("2026-08-30T12:29:59.999Z"))?.localDate,
  "2026-08-30",
);
assert.equal(
  getActiveReminderWindow(new Date("2026-08-31T00:00:00.000Z"))?.localDate,
  "2026-08-31",
);

assert.deepEqual(getReminderContent("daily"), {
  title: "복용 알림",
  body: "오늘의 복용 여부를 확인해보세요.",
  kind: "medication",
  route: "/",
});
assert.deepEqual(getReminderContent("visit_day_before"), {
  title: "내원일 알림",
  body: "내일은 병원 방문일이에요.",
  kind: "visit_day",
  route: "/visits",
});
assert.deepEqual(getReminderContent("visit_day_today"), {
  title: "내원일 알림",
  body: "오늘은 병원 방문일이에요.",
  kind: "visit_day",
  route: "/visits",
});
assert.deepEqual(getReminderContent("as_needed"), {
  title: "복용 알림",
  body: "오늘 중요한 일정이 있다면 복용 계획을 확인해보세요.",
  kind: "medication",
  route: "/",
});
assert.deepEqual(getReminderContent("bedtime"), {
  title: "복용 알림",
  body: "자기 전 평소 복용 계획을 확인해보세요.",
  kind: "medication",
  route: "/",
});
assert.deepEqual(getReminderContent("mood"), {
  title: "감정기록 알림",
  body: "오늘의 감정은 어떠셨나요?",
  kind: "mood",
  route: "/moods/new",
});
assert.equal(isReminderSchedulerEnabled(undefined), false);
assert.equal(isReminderSchedulerEnabled("false"), false);
assert.equal(isReminderSchedulerEnabled("TRUE"), false);
assert.equal(isReminderSchedulerEnabled("true"), true);
assert.equal(isPublicRequestPath("/api/cron/reminders"), true);
assert.equal(isPublicRequestPath("/api/cron/reminders/unsafe-child"), false);

const window = getActiveReminderWindow(new Date("2026-08-31T00:00:00.000Z"));
assert.ok(window);

const claim = {
  userId: "00000000-0000-4000-8000-000000000001",
  localDate: "2026-08-31",
  slotKey: "medication_0900",
  claimToken: "00000000-0000-4000-8000-000000000002",
  attemptCount: 0,
};
const subscription = (id) => ({
  id,
  userId: claim.userId,
  endpoint: `https://push.example.test/${id}`,
  keys: { p256dh: "p".repeat(65), auth: "a".repeat(22) },
});

function createRepository(
  subscriptions = [subscription("sub-a")],
  deliveryKind = "daily",
  claimValue = claim,
) {
  const finalizations = [];
  const calls = { claim: 0, prepare: 0 };
  let available = true;
  return {
    calls,
    finalizations,
    async claimDue() {
      calls.claim += 1;
      if (!available) return [];
      available = false;
      return [claimValue];
    },
    async prepare() {
      calls.prepare += 1;
      return { deliveryKind, attemptCount: 1, subscriptions };
    },
    async finalize(_claim, finalization) {
      finalizations.push(finalization);
    },
  };
}

{
  const visitWindow = getActiveReminderWindows(new Date("2026-08-30T23:00:00.000Z"))[0];
  const visitClaim = {
    ...claim,
    slotKey: "visit_day_before_0800",
    claimToken: "00000000-0000-4000-8000-000000000003",
  };
  const repository = createRepository(
    [subscription("visit")],
    "visit_day_before",
    visitClaim,
  );
  const payloads = [];
  await runReminderScheduler({
    window: visitWindow,
    now: new Date("2026-08-30T23:00:00.000Z"),
    clock: () => new Date("2026-08-30T23:00:10.000Z"),
    repository,
    sendPush: async (_target, payload) => { payloads.push(payload); },
  });
  assert.deepEqual(payloads[0], {
    notificationId: "reminder:2026-08-31:visit_day_before_0800",
    title: "내원일 알림",
    body: "내일은 병원 방문일이에요.",
    route: "/visits",
  });
  assert.deepEqual(Object.keys(payloads[0]).sort(), [
    "body",
    "notificationId",
    "route",
    "title",
  ]);
  assert.doesNotMatch(
    JSON.stringify(payloads[0]),
    /병원명|주소|진료|의사|약 이름|endpoint|p256dh|auth/,
  );
}

const fixedClock = () => new Date("2026-08-31T00:00:10.000Z");
const statusError = (statusCode) => Object.assign(new Error("mock provider failure"), {
  statusCode,
});

{
  const repository = createRepository([
    subscription("accepted"),
    subscription("expired"),
  ]);
  const payloads = [];
  const result = await runReminderScheduler({
    window,
    now: new Date("2026-08-31T00:00:00.000Z"),
    clock: fixedClock,
    repository,
    sendPush: async (target, payload) => {
      payloads.push(payload);
      if (target.endpoint.endsWith("expired")) throw statusError(410);
    },
  });
  assert.deepEqual(result, {
    claimed: 1,
    sent: 1,
    retryableFailed: 0,
    permanentFailed: 0,
    cancelled: 0,
  });
  assert.equal(payloads[0].notificationId, "reminder:2026-08-31:medication_0900");
  assert.equal(payloads[0].body, "오늘의 복용 여부를 확인해보세요.");
  assert.deepEqual(repository.finalizations[0].revokedSubscriptionIds, ["expired"]);
  assert.equal(repository.finalizations[0].outcome, "sent");
}

for (const [statusCode, errorCode] of [[429, "provider_429"], [503, "provider_5xx"]]) {
  const repository = createRepository();
  await runReminderScheduler({
    window,
    now: new Date("2026-08-31T00:00:00.000Z"),
    clock: fixedClock,
    repository,
    sendPush: async () => { throw statusError(statusCode); },
  });
  assert.equal(repository.finalizations[0].outcome, "retryable_failed");
  assert.equal(repository.finalizations[0].errorCode, errorCode);
}

{
  const repository = createRepository();
  await runReminderScheduler({
    window,
    now: new Date("2026-08-31T00:00:00.000Z"),
    clock: fixedClock,
    repository,
    sendPush: async () => { throw new Error("ambiguous timeout"); },
  });
  assert.equal(repository.finalizations[0].outcome, "permanent_failed");
  assert.equal(repository.finalizations[0].errorCode, "provider_outcome_unknown");
}

{
  const repository = createRepository();
  await runReminderScheduler({
    window,
    now: new Date("2026-08-31T00:00:00.000Z"),
    clock: fixedClock,
    repository,
    sendPush: async () => { throw statusError(302); },
  });
  assert.equal(repository.finalizations[0].outcome, "permanent_failed");
  assert.equal(repository.finalizations[0].errorCode, "provider_outcome_unknown");
}

{
  const repository = createRepository([subscription("gone-404"), subscription("gone-410")]);
  await runReminderScheduler({
    window,
    now: new Date("2026-08-31T00:00:00.000Z"),
    clock: fixedClock,
    repository,
    sendPush: async (target) => {
      throw statusError(target.endpoint.endsWith("404") ? 404 : 410);
    },
  });
  assert.equal(repository.finalizations[0].errorCode, "all_endpoints_revoked");
  assert.deepEqual(
    repository.finalizations[0].revokedSubscriptionIds,
    ["gone-404", "gone-410"],
  );
}

{
  const repository = createRepository(Array.from(
    { length: 5 },
    (_, index) => subscription(`window-queued-${index}`),
  ));
  let currentTime = new Date("2026-08-31T00:29:59.000Z");
  let providerCalls = 0;
  const pendingRejections = [];
  const resultPromise = runReminderScheduler({
    window,
    now: currentTime,
    clock: () => currentTime,
    repository,
    sendPush: async () => new Promise((_resolve, reject) => {
      providerCalls += 1;
      pendingRejections.push(() => reject(statusError(410)));
      if (providerCalls === 4) {
        currentTime = new Date("2026-08-31T00:30:00.000Z");
        queueMicrotask(() => pendingRejections.splice(0).forEach((rejectPending) => {
          rejectPending();
        }));
      }
    }),
  });
  const result = await resultPromise;
  assert.equal(providerCalls, 4);
  assert.equal(result.permanentFailed, 1);
  assert.equal(repository.finalizations[0].errorCode, "window_expired_during_send");
  assert.deepEqual(repository.finalizations[0].revokedSubscriptionIds, [
    "window-queued-0",
    "window-queued-1",
    "window-queued-2",
    "window-queued-3",
  ]);
}

{
  const repository = createRepository([subscription("temporary"), subscription("bad-request")]);
  await runReminderScheduler({
    window,
    now: new Date("2026-08-31T00:00:00.000Z"),
    clock: fixedClock,
    repository,
    sendPush: async (target) => {
      throw statusError(target.endpoint.endsWith("temporary") ? 503 : 400);
    },
  });
  assert.equal(repository.finalizations[0].outcome, "permanent_failed");
  assert.equal(repository.finalizations[0].errorCode, "provider_4xx");
  assert.equal(repository.finalizations[0].httpStatus, 400);
}

{
  const repository = createRepository();
  let providerCalls = 0;
  const times = [
    new Date("2026-08-31T00:29:59.999Z"),
    new Date("2026-08-31T00:30:00.000Z"),
  ];
  const result = await runReminderScheduler({
    window,
    now: new Date("2026-08-31T00:29:59.999Z"),
    clock: () => times.shift() ?? new Date("2026-08-31T00:30:00.000Z"),
    repository,
    sendPush: async () => { providerCalls += 1; },
  });
  assert.equal(providerCalls, 0);
  assert.equal(result.cancelled, 1);
  assert.equal(repository.finalizations[0].errorCode, "window_expired_before_send");
}

{
  const repository = createRepository();
  const result = await runReminderScheduler({
    window,
    now: new Date("2026-08-31T00:30:00.000Z"),
    clock: () => new Date("2026-08-31T00:30:00.000Z"),
    repository,
    sendPush: async () => { throw new Error("must not send"); },
  });
  assert.equal(repository.calls.claim, 0);
  assert.equal(result.claimed, 0);
}

{
  const repository = createRepository();
  let providerCalls = 0;
  const input = {
    window,
    now: new Date("2026-08-31T00:00:00.000Z"),
    clock: fixedClock,
    repository,
    sendPush: async () => { providerCalls += 1; },
  };
  const [first, second] = await Promise.all([
    runReminderScheduler(input),
    runReminderScheduler(input),
  ]);
  assert.equal(first.claimed + second.claimed, 1);
  assert.equal(providerCalls, 1);
}

{
  const claims = Array.from({ length: 9 }, (_, index) => ({
    ...claim,
    userId: `batch-user-${index}`,
    claimToken: `batch-token-${index}`,
  }));
  const repository = {
    async claimDue() { return claims; },
    async prepare(batchClaim) {
      return {
        deliveryKind: "daily",
        attemptCount: 1,
        subscriptions: Array.from({ length: 3 }, (_, subscriptionIndex) => ({
          ...subscription(`batch-${batchClaim.userId}-${subscriptionIndex}`),
          userId: batchClaim.userId,
        })),
      };
    },
    async finalize() {},
  };
  let inFlight = 0;
  let maxInFlight = 0;
  const result = await runReminderScheduler({
    window,
    now: new Date("2026-08-31T00:00:00.000Z"),
    clock: fixedClock,
    repository,
    sendPush: async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
    },
  });
  assert.equal(result.claimed, 9);
  assert.equal(result.sent, 9);
  assert.equal(maxInFlight, 4);
}

const routeSource = read("app/api/cron/reminders/route.ts");
const gateIndex = routeSource.indexOf("isReminderSchedulerEnabled");
assert.ok(gateIndex >= 0);
assert.ok(gateIndex < routeSource.indexOf("createSupabaseAdminClient()"));
assert.ok(gateIndex < routeSource.indexOf("assertWebPushConfigured()"));
assert.match(routeSource, /status: "disabled",[\s\S]*claimed: 0,[\s\S]*sent: 0/);

const pushServerSource = read("lib/push/server.ts");
assert.match(pushServerSource, /WEB_PUSH_TIMEOUT_MS = 5_000/);
assert.match(pushServerSource, /timeout: WEB_PUSH_TIMEOUT_MS/);

const schedulerSource = read("lib/reminders/scheduler.ts");
assert.match(schedulerSource, /REMINDER_CLAIM_CONCURRENCY = 4/);
assert.match(schedulerSource, /REMINDER_OUTBOUND_CONCURRENCY = 4/);
assert.match(schedulerSource, /Promise\.allSettled/);

const repositorySource = read("lib/reminders/supabase-repository.ts");
assert.match(repositorySource, /REMINDER_CLAIM_BATCH_LIMIT = 4/);

const migration = read("supabase/migrations/20260831050744_create_reminder_scheduler.sql");
assert.match(migration, /primary key \(user_id, reminder_date, reminder_slot\)/);
assert.match(migration, /'medication_0900'/);
assert.match(migration, /'visit_day_before_0800'/);
assert.match(migration, /'visit_day_today_0800'/);
assert.match(migration, /visit\.visit_date = p_reminder_date \+ 1/);
assert.match(migration, /visit\.visit_date = p_reminder_date/);
assert.match(migration, /subscription\.visit_day_enabled/);
assert.match(migration, /interval '30 minutes'/);
assert.match(migration, /interval '35 days'/);
assert.match(migration, /interval '5 minutes'/);
assert.match(migration, /interval '15 minutes'/);
assert.match(migration, /order by subscription\.updated_at desc, subscription\.id[\s\S]*limit 4/);
assert.match(migration, /alter table public\.reminder_dispatches force row level security/);
assert.match(migration, /revoke all on table public\.reminder_dispatches from public, anon, authenticated/);
assert.match(migration, /grant .* on table public\.reminder_dispatches to service_role/);
assert.match(migration, /url in \('\/moods\?tab=report', '\/moods\/new'\)/);
assert.doesNotMatch(
  migration.match(/create table public\.reminder_dispatches \([\s\S]*?\n\);/)?.[0] ?? "",
  /^\s*(endpoint|p256dh|auth|medication_name|medication_count|body|raw_provider_error)\s/m,
);
assert.doesNotMatch(
  migration.match(/create or replace function public\.reminder_dispatch_eligibility[\s\S]*?\n\$\$;/)?.[0] ?? "",
  /scheduled_time|recorded_at/,
);

const vercel = JSON.parse(read("vercel.json"));
assert.deepEqual(vercel.crons, [{ path: "/api/cron/reminders", schedule: "* * * * *" }]);

console.log("PASS KST slots including both 08:00 visits, 30-minute windows, midnight boundaries, copy, and kill switch");
console.log("PASS provider outcome classification, exact revoke IDs, bounded timeout suppression, bounded concurrency, and atomic-claim fixture");
console.log("PASS migration privacy, visit privacy, RLS/grants, retry offsets, canonical 09:00 key, and every-minute Cron contracts");
