import { NOTIFICATION_TIME_ZONE } from "./constants";

export function formatNotificationTime(createdAt: string, now = new Date()) {
  const created = new Date(createdAt);
  const differenceMs = Math.max(0, now.getTime() - created.getTime());
  if (differenceMs < 60 * 60 * 1000) {
    return `${Math.max(1, Math.floor(differenceMs / 60_000))}분 전`;
  }
  if (differenceMs < 24 * 60 * 60 * 1000) {
    return `${Math.floor(differenceMs / 3_600_000)}시간 전`;
  }
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: NOTIFICATION_TIME_ZONE,
    month: "long",
    day: "numeric",
  }).format(created);
}
