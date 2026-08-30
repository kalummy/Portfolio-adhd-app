import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [navigation, screen, page, styles, screens, schema, notificationApi, pushClient] = await Promise.all([
  readSource("components/bottom-navigation.tsx"),
  readSource("components/notifications-screen.tsx"),
  readSource("app/notifications/page.tsx"),
  readSource("app/globals.css"),
  readSource("lib/analytics/screens.ts"),
  readSource("lib/analytics/schema.ts"),
  readSource("app/api/notifications/route.ts"),
  readSource("lib/push/client.ts"),
]);

assert.doesNotMatch(navigation, /href="\/notifications"/);
assert.match(navigation, /href="\/moods"/);
assert.doesNotMatch(navigation, />기록<\/span>/);
assert.match(page, /<NotificationsScreen \/>/);
assert.doesNotMatch(screen, /BottomNavigation/);
assert.match(screen, /router\.back\(\)/);
assert.match(screen, /notifications-read-all/);
assert.match(screen, /90일 전 알림까지 확인할 수 있어요/);
assert.match(screen, /isVisibleNotificationType/);
assert.doesNotMatch(screen, /공지사항|\[공지\]|아디를 소개합니다/u);
assert.doesNotMatch(screen, /알림 설정|토글|toggle/u);
assert.match(notificationApi, /neq\("notification_type", "announcement"\)/);
assert.match(notificationApi, /NOTIFICATION_RETENTION_DAYS/);
assert.match(pushClient, /Notification\.requestPermission\(\)/);
assert.match(pushClient, /navigator\.serviceWorker\.register\("\/sw\.js"/);
assert.match(styles, /grid-template-columns:\s*repeat\(3,/);
assert.match(styles, /\.notifications-screen\s*\{[^}]*min-height:\s*100dvh;[^}]*padding-bottom:/s);
assert.match(styles, /\.notifications-content\s*\{[^}]*width:\s*100%;/s);
assert.match(styles, /\.notification-row\s*\{[^}]*min-height:\s*88px;/s);
assert.match(screens, /pathname === "\/notifications"\) return "notification"/);
assert.match(schema, /pathname === "\/notifications"\) return "notification"/);

console.log("notification screen fixtures: PASS");
