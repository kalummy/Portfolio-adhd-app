import { ResourceCache } from './resource-cache';
import { fetchNativeApi } from './client';
import { getNativeAuthSnapshot, subscribeNativeAuth } from '../auth/runtime';

// Verified catalog image bytes only, bounded to 16 entries of at most 512 KiB each.
// Components own their object URLs; unmounting one cannot cancel another consumer.
const cache = new ResourceCache(5 * 60_000, () => performance.now(), 16);
function scope() { cache.setScope(getNativeAuthSnapshot().user?.id ?? ''); }
subscribeNativeAuth(scope);
export async function getNativeMedicationImage(path: string) {
  scope();
  if (!getNativeAuthSnapshot().user || !/^\/api\/medications\/image\/\d{9}$/.test(path)) throw new Error('image_denied');
  return cache.read('image', path, async () => {
    const response = await fetchNativeApi(path);
    if (!response.ok) throw new Error('image_unavailable');
    const blob = await response.blob();
    return blob;
  }, blob => blob.size <= 512 * 1024);
}
