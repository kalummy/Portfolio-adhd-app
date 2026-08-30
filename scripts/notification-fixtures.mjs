import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  VISIBLE_NOTIFICATION_KINDS,
  formatNotificationTime,
  getNotificationCutoff,
  getNotificationTargetUrl,
  toAppNotification,
} from "../lib/notification-contract.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sha256 = (path) => createHash("sha256").update(read(path)).digest("hex");

assert.deepEqual(VISIBLE_NOTIFICATION_KINDS, ["medication", "visit_day", "mood"]);
assert.equal(getNotificationTargetUrl("medication"), "/");
assert.equal(getNotificationTargetUrl("visit_day"), "/visits");
assert.equal(getNotificationTargetUrl("mood"), "/moods?tab=report");

const now = new Date("2026-08-30T05:00:00.000Z");
assert.equal(getNotificationCutoff(now), "2026-06-01T05:00:00.000Z");
assert.equal(formatNotificationTime("2026-08-30T04:59:10.000Z", now), "1분 전");
assert.equal(formatNotificationTime("2026-08-30T00:00:00.000Z", now), "5시간 전");
assert.equal(formatNotificationTime("2026-06-03T15:00:00.000Z", now), "6월 4일");

const baseRow = {
  notification_id: "fixture-id",
  title: "알림",
  body: "본문",
  url: "https://unsafe.example",
  fired_at: now.toISOString(),
  read_at: null,
};
assert.equal(toAppNotification({ ...baseRow, kind: "medication" })?.targetUrl, "/");
assert.equal(toAppNotification({ ...baseRow, kind: "visit_eve" }), null);
assert.equal(toAppNotification({ ...baseRow, kind: "focus" }), null);

const bell = read("components/notification-bell-button.tsx");
const screen = read("components/notifications-screen.tsx");
const home = read("components/home-screen.tsx");
const repository = read("lib/notifications.ts");
const migration = read("supabase/migrations/20260830052705_harden_app_notifications_phase1.sql");
const styles = read("app/globals.css");

assert.match(bell, /href="\/notifications"/);
assert.match(bell, /notification-bell-unread\.svg/);
assert.doesNotMatch(bell, /Notification\.permission|requestPermission|PushManager|serviceWorker/);
assert.match(home, /<NotificationBellButton\s*\/>/);
assert.match(home, /<BottomNavigation activeTab="home"/);

assert.match(screen, /markNotificationRead\(notification\.id/);
assert.match(screen, /markAllRecentNotificationsRead/);
assert.doesNotMatch(screen, /BottomNavigation/);
assert.doesNotMatch(screen, /공지사항|>설정</);
assert.doesNotMatch(screen, /Notification\.permission|requestPermission|PushManager|serviceWorker/);

assert.match(repository, /\.from\("app_notifications"\)/);
assert.match(repository, /\.gte\("fired_at", getNotificationCutoff\(now\)\)/);
assert.match(repository, /\.is\("read_at", null\)/);
assert.match(repository, /\.in\("kind", visibleKinds\(\)\)/);

assert.match(migration, /create table if not exists public\.app_notifications/);
assert.doesNotMatch(migration, /create table(?: if not exists)? public\.notifications\s*\(/);
assert.match(migration, /on delete cascade/);
assert.match(migration, /alter table public\.app_notifications enable row level security/);
assert.match(migration, /revoke insert, update, delete on table public\.app_notifications from authenticated/);
assert.match(migration, /grant update \(read_at\) on table public\.app_notifications to authenticated/);
assert.match(migration, /using \(\(select auth\.uid\(\)\) = user_id\)/);
assert.match(migration, /kind in \('medication', 'visit_day', 'mood'\)/);

assert.match(styles, /\.notification-row\.unread\s*\{\s*background: #f0f8fe;/);
assert.match(styles, /gap: 14px;/);
assert.match(styles, /font-size: 15px;[\s\S]*line-height: 22px;[\s\S]*letter-spacing: -0\.375px;/);
assert.match(styles, /font-size: 14px;[\s\S]*line-height: 20px;[\s\S]*letter-spacing: -0\.35px;/);

assert.equal(sha256("public/icons/notification-bell.svg"), "69c178abd4190f3bca929ede03afd83c54ab2dad13fdd7f3a736be76cbde7153");
assert.equal(sha256("public/icons/notification-bell-unread.svg"), "115e233b123317958b8133ced38d07b0fe9d00dbd48269ee5a6f0c20d2ca747d");
assert.equal(sha256("public/icons/notification-medication.svg"), "f8ea600d133bbdc8126db078c4712450182a6f23b1e126399431c0d9244cf1eb");
assert.equal(sha256("public/icons/notification-visit-building.svg"), "75fb7b921bb821a3188011ef925139f40d75a7ae5f5dd51dfdb7dfc513b1ea1a");
assert.equal(sha256("public/icons/notification-visit-medication.svg"), "3cdc96ca5b500900605c02f32d5927687e4a45adf9c35592ce8269fcaedbadbd");
assert.equal(sha256("public/icons/notification-mood.svg"), "365013287ed1a2277cc1d2856ef389d3380ff2769ea61d789c0e250393cd0fce");

console.log("PASS notification routes, 90-day filtering, read state, RLS contract, and exact Figma SVG assets");
console.log("PASS notification inbox remains separate from Push permission and Bottom Navigation");
