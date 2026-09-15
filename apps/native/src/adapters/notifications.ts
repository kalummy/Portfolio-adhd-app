import { NOTIFICATION_PREVIEW_ITEMS } from '@/lib/preview-notifications-fixture';
const items = structuredClone(NOTIFICATION_PREVIEW_ITEMS).map((item, index) => ({ ...item, firedAt: new Date(Date.now() - (index + 1) * 60000).toISOString() }));
export async function listRecentNotifications(_now?: Date) { return structuredClone(items); }
export async function hasUnreadNotifications() { return items.some(item => !item.readAt); }
export async function markNotificationRead(id: string, _now?: Date) { const item = items.find(item => item.id === id); if (item) item.readAt = new Date().toISOString(); }
export async function markAllRecentNotificationsRead(_now?: Date) { items.forEach(item => { item.readAt = new Date().toISOString(); }); }
