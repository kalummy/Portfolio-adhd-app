import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [navigation, screen, page, styles, screens, schema] = await Promise.all([
  readSource("components/bottom-navigation.tsx"),
  readSource("components/notifications-screen.tsx"),
  readSource("app/notifications/page.tsx"),
  readSource("app/globals.css"),
  readSource("lib/analytics/screens.ts"),
  readSource("lib/analytics/schema.ts"),
]);

assert.match(navigation, /href="\/notifications"/);
assert.match(navigation, /activeTab === "notifications"/);
assert.match(navigation, /getCurrentUser\(\)[\s\S]*\.catch\(\(\) => undefined\)/);
assert.match(navigation, />알림<\/span>/);
assert.match(navigation, /href="\/moods"/);
assert.doesNotMatch(navigation, />기록<\/span>/);
assert.match(page, /<NotificationsScreen \/>/);
assert.match(screen, /<BottomNavigation activeTab="notifications" \/>/);
assert.match(screen, /router\.back\(\)/);
assert.doesNotMatch(screen, /공지사항|\[공지\]|아디를 소개합니다|복용 알림|내원 알림|감정기록 알림/u);
assert.doesNotMatch(screen, /serviceWorker|PushManager|firebase|FCM|supabase/u);
assert.match(styles, /grid-template-columns:\s*repeat\(4,/);
assert.match(styles, /\.notifications-screen\s*\{[^}]*min-height:\s*100dvh;[^}]*padding-bottom:/s);
assert.match(styles, /\.notifications-content\s*\{[^}]*width:\s*100%;/s);
assert.match(screens, /pathname === "\/notifications"\) return "notification"/);
assert.match(schema, /pathname === "\/notifications"\) return "notification"/);

console.log("notification screen fixtures: PASS");
