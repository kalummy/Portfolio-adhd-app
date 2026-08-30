export const VISIBLE_NOTIFICATION_KINDS = [
  "medication",
  "visit_day",
  "mood",
] as const;

export type VisibleNotificationKind = (typeof VISIBLE_NOTIFICATION_KINDS)[number];

export type AppNotification = {
  id: string;
  kind: VisibleNotificationKind;
  title: string;
  body: string;
  targetUrl: "/" | "/visits" | "/moods?tab=report";
  firedAt: string;
  readAt: string | null;
};

export type AppNotificationRow = {
  notification_id: string;
  kind: string;
  title: string;
  body: string;
  url: string;
  fired_at: string;
  read_at: string | null;
};

export const NOTIFICATION_RETENTION_DAYS = 90;
export const NOTIFICATION_RETENTION_MS = NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000;

const TARGET_URL_BY_KIND: Record<VisibleNotificationKind, AppNotification["targetUrl"]> = {
  medication: "/",
  visit_day: "/visits",
  mood: "/moods?tab=report",
};

export function isVisibleNotificationKind(value: string): value is VisibleNotificationKind {
  return (VISIBLE_NOTIFICATION_KINDS as readonly string[]).includes(value);
}

export function getNotificationCutoff(now = new Date()) {
  return new Date(now.getTime() - NOTIFICATION_RETENTION_MS).toISOString();
}

export function getNotificationTargetUrl(kind: VisibleNotificationKind) {
  return TARGET_URL_BY_KIND[kind];
}

export function toAppNotification(row: AppNotificationRow): AppNotification | null {
  if (!isVisibleNotificationKind(row.kind)) return null;

  return {
    id: row.notification_id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    targetUrl: getNotificationTargetUrl(row.kind),
    firedAt: row.fired_at,
    readAt: row.read_at,
  };
}

export function formatNotificationTime(firedAt: string, now = new Date()) {
  const firedAtTime = new Date(firedAt).getTime();
  const elapsedMs = Math.max(0, now.getTime() - firedAtTime);
  const elapsedMinutes = Math.max(1, Math.floor(elapsedMs / 60_000));

  if (elapsedMinutes < 60) return `${elapsedMinutes}분 전`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}시간 전`;

  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(new Date(firedAt));
}
