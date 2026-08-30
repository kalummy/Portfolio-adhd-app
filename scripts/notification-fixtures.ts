import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  MEDICATION_REMINDER_SLOTS,
  NOTIFICATION_CONTENT,
  NOTIFICATION_RETENTION_DAYS,
  NOTIFICATION_TIME_ZONE,
  isVisibleNotificationType,
  notificationRouteIsSafe,
} from "../lib/notifications/constants";
import { formatNotificationTime } from "../lib/notifications/time";

assert.deepEqual(MEDICATION_REMINDER_SLOTS, ["10:00", "13:00", "16:00", "22:00"]);
assert.equal(NOTIFICATION_TIME_ZONE, "Asia/Seoul");
assert.equal(NOTIFICATION_RETENTION_DAYS, 90);
assert.deepEqual(NOTIFICATION_CONTENT.medication_reminder, {
  title: "복용 알림",
  body: "오늘 복용기록이 없어요.",
});
assert.deepEqual(NOTIFICATION_CONTENT.visit_reminder, {
  title: "내원 알림",
  body: "오늘은 내원일이에요.",
});
assert.deepEqual(NOTIFICATION_CONTENT.mood_reminder, {
  title: "감정기록 알림",
  body: "지금 리포트 결과를 확인해보세요.",
});
assert.equal(isVisibleNotificationType("announcement"), false);
assert.equal(isVisibleNotificationType("medication_reminder"), true);
assert.equal(notificationRouteIsSafe("/?date=2026-08-30"), true);
assert.equal(notificationRouteIsSafe("/visits"), true);
assert.equal(notificationRouteIsSafe("/moods?tab=report"), true);
assert.equal(notificationRouteIsSafe("//example.com"), false);

const now = new Date("2026-08-30T10:00:00.000Z");
assert.equal(formatNotificationTime("2026-08-30T09:59:30.000Z", now), "1분 전");
assert.equal(formatNotificationTime("2026-08-30T05:00:00.000Z", now), "5시간 전");

const migration = await readFile(
  new URL("../supabase/migrations/20260830040055_notifications_and_push_subscriptions.sql", import.meta.url),
  "utf8",
);
const vercel = await readFile(new URL("../vercel.json", import.meta.url), "utf8");
const serviceWorker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

assert.match(migration, /at time zone 'Asia\/Seoul'/);
assert.match(migration, /v_reminder_slot in \('10:00', '13:00', '16:00', '22:00'\)/);
assert.match(migration, /not exists \([\s\S]*medication_intake_records[\s\S]*intake_date = v_local_date/);
assert.match(migration, /unique \(user_id, dedupe_key\)/);
assert.match(migration, /mood_records_create_notification_after_completion/);
assert.match(migration, /neq|announcement|notification_type = 'announcement'/);
assert.doesNotMatch(migration, /insert into public\.notifications[\s\S]{0,800}'announcement'/);
assert.match(vercel, /"schedule": "0 1,4,7,13,15 \* \* \*"/);
assert.match(serviceWorker, /addEventListener\("push"/);
assert.match(serviceWorker, /addEventListener\("notificationclick"/);
assert.match(serviceWorker, /method: "PATCH"/);

console.log("notification fixtures: PASS");
