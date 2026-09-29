export * from '../../../../lib/notifications';
import { hasUnreadNotifications as readUnread } from '../../../../lib/notifications';
import { getNativeAuthSnapshot, subscribeNativeAuth } from '../auth/runtime';

let pending: { owner: string; request: Promise<boolean> } | undefined;
subscribeNativeAuth(() => {
  if (pending?.owner !== getNativeAuthSnapshot().user?.id) pending = undefined;
});
/** Focus/pageshow/visibility can arrive together. Share only that in-flight read. */
export function hasUnreadNotifications(now = new Date()): Promise<boolean> {
  const owner = getNativeAuthSnapshot().user?.id;
  if (!owner) return Promise.reject(new Error('authentication_required'));
  if (pending?.owner === owner) return pending.request;
  const request = readUnread(now).then(result => {
    if (getNativeAuthSnapshot().user?.id !== owner) throw new Error('account_changed');
    return result;
  }).finally(() => { if (pending?.request === request) pending = undefined; });
  pending = { owner, request };
  return request;
}
