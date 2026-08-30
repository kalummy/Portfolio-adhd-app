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
import {
  isPushNotificationRoute,
  isPushEndpoint,
  isPushSubscriptionInput,
} from "../lib/push/contracts.ts";
import {
  DISABLED_PUSH_PREFERENCES,
  rollbackPushPreference,
  setPushPreference,
} from "../lib/push/preferences.ts";
import { isNotificationPushTestEnvironment } from "../lib/preview-environment.ts";
import {
  NOTIFICATION_PREVIEW_ITEMS,
  NOTIFICATION_PREVIEW_NOW,
} from "../lib/preview-notifications-fixture.ts";

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
const settingsScreen = read("components/notification-settings-screen.tsx");
const settingsPage = read("app/notifications/settings/page.tsx");
const previewSettingsPage = read("app/preview/notifications/settings/page.tsx");
const previewOffPage = read("app/preview/notifications/off/page.tsx");
const previewEmptyPage = read("app/preview/notifications/empty/page.tsx");
const pushStatusRoute = read("app/api/push/subscriptions/status/route.ts");
const bottomNavigation = read("components/bottom-navigation.tsx");
const home = read("components/home-screen.tsx");
const repository = read("lib/notifications.ts");
const baseMigration = read("supabase/migrations/20260830000000_create_app_notifications.sql");
const hardeningMigration = read("supabase/migrations/20260830052706_harden_app_notifications_forward_only.sql");
const pushMigration = read("supabase/migrations/20260830062111_create_push_subscriptions_phase2.sql");
const pushPreferencesMigration = read("supabase/migrations/20260830083000_add_push_subscription_preferences.sql");
const styles = read("app/globals.css");
const serviceWorker = read("public/sw.js");
const pushClient = read("lib/push/client.ts");
const subscriptionsRoute = read("app/api/push/subscriptions/route.ts");
const testPushRoute = read("app/api/push/test/route.ts");
const previewPage = read("app/preview/notifications/page.tsx");
const previewHomePage = read("app/preview/notifications/home/page.tsx");
const proxy = read("proxy.ts");

assert.match(bell, /href = "\/notifications"/);
assert.match(bell, /notification-red-dot\.svg/);
assert.doesNotMatch(bell, /Notification\.permission|requestPermission|PushManager|serviceWorker/);
assert.match(home, /<NotificationBellButton/);
assert.match(home, /<BottomNavigation activeTab="home"/);
assert.match(bottomNavigation, /<Link[\s\S]*href="\/moods"/);
assert.match(bottomNavigation, /onClick=\{scheduleTabHaptic\}/);
assert.match(bottomNavigation, /window\.setTimeout\(\(\) => \{[\s\S]*navigator\.vibrate\(8\)/);
assert.doesNotMatch(bottomNavigation, /router\.push|router\.prefetch|bottom-navigation-ios-haptic|switch: ""/);
assert.doesNotMatch(styles, /\.bottom-navigation-ios-haptic/);

assert.match(screen, /markNotificationRead\(notification\.id/);
assert.match(screen, /markAllRecentNotificationsRead/);
assert.doesNotMatch(screen, /BottomNavigation/);
assert.doesNotMatch(screen, /공지사항/);
assert.match(screen, /settingsHref = "\/notifications\/settings"/);
assert.match(screen, /<Link className="notifications-settings" href=\{settingsHref\}>/);
assert.match(screen, /설정[\s\S]*<\/Link>[\s\S]*모두 읽음/);
assert.match(screen, /initialPushState/);
assert.match(screen, /showEmptyInbox/);
assert.match(screen, /notifications-empty-state/);
assert.match(screen, /notifications-push-off-state/);
assert.match(screen, /requestPushSubscription\(\)/);

assert.match(repository, /\.from\("app_notifications"\)/);
assert.match(repository, /\.gte\("fired_at", getNotificationCutoff\(now\)\)/);
assert.match(repository, /\.is\("read_at", null\)/);
assert.match(repository, /\.in\("kind", visibleKinds\(\)\)/);
assert.match(repository, /markAllRecentNotificationsRead[\s\S]*\.update\(\{ read_at: now\.toISOString\(\) \}\)/);
assert.doesNotMatch(repository, /markAllRecentNotificationsRead[\s\S]*\.delete\(\)/);
assert.match(screen, /setNotifications\(\(current\) => current\.map\(\(notification\)/);

assert.match(baseMigration, /create table public\.app_notifications/);
assert.doesNotMatch(baseMigration, /create table(?: if not exists)? public\.notifications\s*\(/);
assert.match(baseMigration, /on delete cascade/);
assert.match(hardeningMigration, /alter table public\.app_notifications enable row level security/);
assert.match(hardeningMigration, /revoke insert, update, delete on table public\.app_notifications from authenticated/);
assert.match(hardeningMigration, /grant update \(read_at\) on table public\.app_notifications to authenticated/);
assert.match(hardeningMigration, /using \(\(select auth\.uid\(\)\) = user_id\)/);
assert.match(hardeningMigration, /kind in \('medication', 'visit_day', 'mood'\)/);
assert.match(hardeningMigration, /alter column fired_at set default now\(\)/);

assert.match(pushMigration, /create table public\.push_subscriptions/);
assert.match(pushMigration, /user_id uuid not null references auth\.users\(id\) on delete cascade/);
assert.match(pushMigration, /endpoint text not null unique/);
assert.match(pushMigration, /grant select, delete on table public\.push_subscriptions to authenticated/);
assert.doesNotMatch(pushMigration, /grant .*insert.* to authenticated/i);
assert.doesNotMatch(pushMigration, /grant .*update.* to authenticated/i);
assert.match(pushMigration, /using \(\(select auth\.uid\(\)\) = user_id\)/);

assert.equal(isPushSubscriptionInput({
  endpoint: "https://push.example.test/device",
  keys: { p256dh: "a".repeat(65), auth: "b".repeat(22) },
  startWithPreferencesDisabled: true,
}), true);
assert.equal(isPushSubscriptionInput({
  endpoint: "https://push.example.test/device",
  keys: { p256dh: "a".repeat(65), auth: "b".repeat(22) },
  startWithPreferencesDisabled: "yes",
}), false);
assert.equal(isPushSubscriptionInput({
  endpoint: "http://push.example.test/device",
  keys: { p256dh: "a".repeat(65), auth: "b".repeat(22) },
}), false);
assert.equal(isPushNotificationRoute("/"), true);
assert.equal(isPushNotificationRoute("//example.com"), false);
assert.equal(isPushEndpoint("https://push.example.test/device"), true);
assert.equal(isPushEndpoint("http://push.example.test/device"), false);

const medicationOn = setPushPreference(DISABLED_PUSH_PREFERENCES, "medication", true);
assert.deepEqual(medicationOn, { medication: true, visit_day: false, mood: false });
const visitOnlyOn = setPushPreference(DISABLED_PUSH_PREFERENCES, "visit_day", true);
assert.deepEqual(visitOnlyOn, { medication: false, visit_day: true, mood: false });
const moodOnlyOn = setPushPreference(DISABLED_PUSH_PREFERENCES, "mood", true);
assert.deepEqual(moodOnlyOn, { medication: false, visit_day: false, mood: true });
const medicationAndMoodOn = setPushPreference(medicationOn, "mood", true);
assert.deepEqual(medicationAndMoodOn, { medication: true, visit_day: false, mood: true });
const visitOnWhileMedicationSaves = setPushPreference(medicationOn, "visit_day", true);
assert.deepEqual(visitOnWhileMedicationSaves, { medication: true, visit_day: true, mood: false });
assert.deepEqual(
  rollbackPushPreference(visitOnWhileMedicationSaves, "medication", true, false),
  { medication: false, visit_day: true, mood: false },
);
assert.equal(
  rollbackPushPreference(medicationAndMoodOn, "medication", false, true),
  medicationAndMoodOn,
  "a stale response must not roll back a newer value",
);

const originalPreviewEnvironment = {
  nodeEnv: process.env.NODE_ENV,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  vercelEnv: process.env.VERCEL_ENV,
};
process.env.NODE_ENV = "production";
process.env.VERCEL_ENV = "preview";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ohobxicxchkaisxxswkk.supabase.co";
assert.equal(isNotificationPushTestEnvironment(), true);
process.env.VERCEL_ENV = "production";
assert.equal(isNotificationPushTestEnvironment(), false);
process.env.VERCEL_ENV = "preview";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://joffvlsyxivveqycjrio.supabase.co";
assert.equal(isNotificationPushTestEnvironment(), false);
process.env.NEXT_PUBLIC_SUPABASE_URL = "not-a-url";
assert.equal(isNotificationPushTestEnvironment(), false);
for (const [key, value] of Object.entries({
  NODE_ENV: originalPreviewEnvironment.nodeEnv,
  NEXT_PUBLIC_SUPABASE_URL: originalPreviewEnvironment.supabaseUrl,
  VERCEL_ENV: originalPreviewEnvironment.vercelEnv,
})) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

assert.match(styles, /\.notification-row\.unread\s*\{\s*background: var\(--color-bg-base-01\);/);
assert.match(styles, /\.notification-row\.unread \.notification-icon\s*\{\s*background: var\(--color-bg-base-05\);/);
assert.match(styles, /gap: 14px;/);
assert.match(styles, /font-size: 15px;[\s\S]*line-height: 22px;[\s\S]*letter-spacing: -0\.375px;/);
assert.match(styles, /font-size: 14px;[\s\S]*line-height: 20px;[\s\S]*letter-spacing: -0\.35px;/);
assert.match(styles, /mask: url\("\/icons\/notification-bell-solid\.svg"\)/);
assert.match(styles, /background: var\(--color-font-base-06\)/);
assert.match(styles, /\.notifications-actions[\s\S]*gap: 12px;/);
assert.match(styles, /\.notification-visit-icon img:first-child[\s\S]*top: 16\.15%;[\s\S]*left: 9\.38%;/);
assert.match(styles, /\.notification-visit-icon img:last-child[\s\S]*left: 34\.79%;/);
assert.match(styles, /\.notifications-retention-note[\s\S]*position: fixed;[\s\S]*bottom: 80px;/);
assert.match(styles, /\.notification-settings-list[\s\S]*gap: 24px;/);
assert.match(styles, /\.notification-settings-item[\s\S]*padding: 0 20px;[\s\S]*gap: 16px;/);
assert.match(styles, /\.notification-settings-toggle[\s\S]*width: 62px;[\s\S]*height: 32px;/);
assert.match(styles, /\.notifications-state[\s\S]*top: 50%;[\s\S]*transform: translate\(-50%, -50%\);/);
assert.match(styles, /\.notifications-state-icon[\s\S]*width: 64px;[\s\S]*height: 64px;/);
assert.match(styles, /\.notifications-enable-push[\s\S]*width: 148px;[\s\S]*padding: 10px 16px;[\s\S]*border-radius: 10px;/);

assert.equal(sha256("public/icons/notification-bell-solid.svg"), "f992432adc926d43ec750c2caf365d8885f47f99b4820994859cdecb9e0a5ae2");
assert.equal(sha256("public/icons/notification-red-dot.svg"), "bcde37d598a1b5141563c1148e371aec3f17fd6fec123df10fedc47367f5cfd5");
assert.equal(sha256("public/icons/notification-medication.svg"), "f8ea600d133bbdc8126db078c4712450182a6f23b1e126399431c0d9244cf1eb");
assert.equal(sha256("public/icons/notification-visit-building.svg"), "75fb7b921bb821a3188011ef925139f40d75a7ae5f5dd51dfdb7dfc513b1ea1a");
assert.equal(sha256("public/icons/notification-visit-medication.svg"), "3cdc96ca5b500900605c02f32d5927687e4a45adf9c35592ce8269fcaedbadbd");
assert.equal(sha256("public/icons/notification-mood.svg"), "365013287ed1a2277cc1d2856ef389d3380ff2769ea61d789c0e250393cd0fce");
assert.equal(sha256("public/icons/notification-off-bell.svg"), "442794ff26dd0456c0ab768d1566c1997441fb0922fc758cd37cb3cc195cd0be");
assert.equal(sha256("public/icons/notification-toggle-on-track.svg"), "8a8fb635138eeb63909ac5ca2c419e618b35ce49c2176715589758e2b25fc559");
assert.equal(sha256("public/icons/notification-toggle-on-thumb.svg"), "ea3757748e0e42fd69aa31b55dc866f66473d14950e1307d720931a9f2377f7b");
assert.equal(sha256("public/icons/notification-toggle-off.svg"), "37fe77445dc19498b0bcff553be5607287af30e4e4b07c14b316b9a15fbf1c34");

assert.deepEqual(
  NOTIFICATION_PREVIEW_ITEMS.map(({ kind, title, body }) => ({ kind, title, body })),
  [
    { kind: "medication", title: "복용 알림", body: "오늘 복용기록이 없어요." },
    { kind: "visit_day", title: "내원 알림", body: "오늘은 내원일이에요." },
    { kind: "mood", title: "감정기록 알림", body: "지금 리포트 결과를 확인해보세요." },
  ],
);
assert.equal(formatNotificationTime(NOTIFICATION_PREVIEW_ITEMS[0].firedAt, new Date(NOTIFICATION_PREVIEW_NOW)), "1분 전");
assert.equal(formatNotificationTime(NOTIFICATION_PREVIEW_ITEMS[1].firedAt, new Date(NOTIFICATION_PREVIEW_NOW)), "5시간 전");
assert.equal(formatNotificationTime(NOTIFICATION_PREVIEW_ITEMS[2].firedAt, new Date(NOTIFICATION_PREVIEW_NOW)), "6월 4일");
assert.equal(NOTIFICATION_PREVIEW_ITEMS.some(({ title }) => title === "공지사항"), false);
assert.match(previewPage, /initialNotifications=\{NOTIFICATION_PREVIEW_ITEMS\}/);
assert.match(previewPage, /settingsHref="\/preview\/notifications\/settings"/);
assert.match(previewPage, /initialPushState="subscribed"/);
assert.match(previewHomePage, /previewHasUnreadNotifications/);
assert.match(previewHomePage, /previewNotificationHref="\/preview\/notifications"/);
assert.match(proxy, /isNotificationPreviewEnvironment\(\)/);

assert.match(pushClient, /navigator\.userActivation/);
assert.match(pushClient, /Notification\.requestPermission\(\)/);
assert.match(pushClient, /pushManager\.subscribe/);
assert.match(subscriptionsRoute, /existing\.user_id !== userId/);
assert.doesNotMatch(home, /requestPushSubscription|Notification\.requestPermission/);
assert.doesNotMatch(bell, /requestPushSubscription|Notification\.requestPermission/);
assert.match(bell, /window\.addEventListener\("focus", refreshUnreadState\)/);
assert.match(settingsPage, /<NotificationSettingsScreen \/>/);
assert.match(previewSettingsPage, /isNotificationPreviewEnvironment\(\)/);
assert.match(previewSettingsPage, /initialState="default"/);
assert.match(previewOffPage, /isNotificationPreviewEnvironment\(\)/);
assert.match(previewOffPage, /<NotificationsScreen/);
assert.match(previewOffPage, /initialPushState="default"/);
assert.match(previewEmptyPage, /<NotificationsScreen/);
assert.match(previewEmptyPage, /initialNotifications=\{\[\]\}/);
assert.match(previewEmptyPage, /initialPushState="subscribed"/);
assert.match(pushStatusRoute, /\.eq\("user_id", userData\.user\.id\)/);
assert.match(pushStatusRoute, /\.eq\("endpoint", body\.endpoint\)/);
assert.match(pushStatusRoute, /\.is\("revoked_at", null\)/);
assert.match(settingsScreen, /<h1>알림 설정<\/h1>/);
assert.match(settingsScreen, /currentState === "denied"/);
assert.match(settingsScreen, /role="switch"/);
assert.match(settingsScreen, /복용 알림/);
assert.match(settingsScreen, /내원일 알림/);
assert.match(settingsScreen, /감정기록 알림/);
assert.match(settingsScreen, /updateCurrentPushPreference\(kind, enabled\)/);
assert.match(settingsScreen, /getCurrentPushSnapshot\(\)/);
assert.match(settingsScreen, /requestPushSubscription\(\{[\s\S]*startWithPreferencesDisabled: true/);
assert.match(settingsScreen, /pendingRef\.current\[kind\]/);
assert.match(settingsScreen, /!Object\.values\(pendingRef\.current\)\.some\(Boolean\)/);
assert.match(settingsScreen, /disabled=\{stateDisablesControls \|\| pending\[item\.kind\]\}/);
assert.match(settingsScreen, /rollbackPushPreference\(/);
assert.doesNotMatch(settingsScreen, /getCurrentPushPreferences|Promise\.all|unsubscribeFromPush|router\.refresh/);
assert.match(screen, /notification-off-bell\.svg/);
assert.match(screen, /requestPushSubscription\(\)|getCurrentPushState\(\)/);
assert.match(settingsScreen, /notification-toggle-on-track\.svg/);
assert.match(settingsScreen, /notification-toggle-on-thumb\.svg/);
assert.match(settingsScreen, /notification-toggle-off\.svg/);
assert.match(pushClient, /\/api\/push\/subscriptions\/status/);
assert.match(pushClient, /preferences: result\.preferences \?\? null/);
assert.match(pushClient, /method: "PATCH",[\s\S]*keepalive: true/);
assert.match(subscriptionsRoute, /export async function PATCH/);
assert.match(subscriptionsRoute, /isPushPreferenceKind\(body\.kind\)/);
assert.match(subscriptionsRoute, /input\.startWithPreferencesDisabled/);
assert.match(subscriptionsRoute, /medication_enabled: false/);
assert.match(subscriptionsRoute, /visit_day_enabled: false/);
assert.match(subscriptionsRoute, /mood_enabled: false/);
assert.match(subscriptionsRoute, /\.update\(\{ \[columnByKind\[body\.kind\]\]: body\.enabled/);
assert.match(subscriptionsRoute, /\.eq\("user_id", userId\)[\s\S]*\.eq\("endpoint", body\.endpoint\)[\s\S]*\.is\("revoked_at", null\)/);
assert.match(subscriptionsRoute, /\.select\("id"\)[\s\S]*\.maybeSingle\(\)/);
assert.match(testPushRoute, /\.eq\("medication_enabled", true\)/);
assert.match(pushPreferencesMigration, /add column if not exists medication_enabled boolean not null default true/);
assert.match(pushPreferencesMigration, /add column if not exists visit_day_enabled boolean not null default true/);
assert.match(pushPreferencesMigration, /add column if not exists mood_enabled boolean not null default true/);
assert.match(testPushRoute, /isNotificationPushTestEnvironment\(\)/);
assert.match(testPushRoute, /\.eq\("notification_id", notificationId\)/);
assert.match(testPushRoute, /PRODUCTION_PUSH_E2E_USER_ID/);
assert.match(testPushRoute, /joffvlsyxivveqycjrio\.supabase\.co/);
assert.match(testPushRoute, /userData\.user\.id !== productionTestUserId/);
assert.match(testPushRoute, /keys\.length === 1/);
assert.match(testPushRoute, /keys\[0\] === "endpoint"/);
assert.match(testPushRoute, /\.maybeSingle\(\)/);
assert.match(testPushRoute, /PRODUCTION_E2E_NOTIFICATION_ID/);
assert.match(testPushRoute, /notificationError\.code === "23505"/);
assert.doesNotMatch(testPushRoute, /Promise\.all|subscriptions\.map/);
assert.ok(
  pushClient.indexOf('if (!response.ok) throw new Error("push_subscription_revoke_failed")')
    < pushClient.lastIndexOf("await subscription.unsubscribe()"),
  "server revoke must succeed before the current browser subscription is removed",
);
assert.match(serviceWorker, /self\.addEventListener\("push"/);
assert.match(serviceWorker, /self\.addEventListener\("notificationclick"/);
assert.match(serviceWorker, /\/api\/notifications\/read/);
assert.match(serviceWorker, /await openNotificationRoute\(route\)/);
assert.match(testPushRoute, /isNotificationPushTestEnvironment\(\)/);
assert.match(testPushRoute, /isEndpointOnlyInput\(input\)/);
assert.match(testPushRoute, /\.eq\("endpoint", input\.endpoint\)/);
assert.match(testPushRoute, /title: "복용 알림"/);
assert.match(testPushRoute, /body: "오늘 복용기록이 없어요\."/);
assert.doesNotMatch(testPushRoute, /10:00|13:00|16:00|22:00|cron|visit_day|mood/);

console.log("PASS Figma bell/header fidelity, isolated Preview fixtures, and no announcement notification");
console.log("PASS Push permission gesture, subscription RLS, test-send guard, display, and click-to-read contracts");
console.log("PASS independent optimistic preferences, targeted rollback, active-row persistence, and direct Link navigation");
