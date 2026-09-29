import { measureNative } from '../platform/performance';
import type { MedicationRepository } from '@/lib/repositories/medications/types';
import type { MedicationIntakeRepository } from '@/lib/repositories/intake-records/types';
import { DuplicateMoodRecordError, type MoodRepository } from '@/lib/repositories/moods/types';
import type { VisitScheduleRepository } from '@/lib/repositories/visit-schedules/types';
import { methods, type RepositoryName } from '../../../../lib/native-api/contracts';
import { fetchNativeApi } from '../api/client';
import { getNativeAuthSnapshot, subscribeNativeAuth } from '../auth/runtime';
import { ResourceCache } from '../api/resource-cache';
import type { SavedMedication, MedicationIntakeRecord, MoodRecord } from '@/lib/types';

const cache = new ResourceCache();
const writes = new Set(['createMany','deactivate','updateSchedule','setTaken','updateRecordedAt','save','deleteByDate','saveUpcoming','deleteUpcoming']);
const allKey = JSON.stringify(['listAll', []]);
function syncScope() {
  const state = getNativeAuthSnapshot();
  cache.setScope(state.status === 'signed_in' ? state.user?.id ?? '' : '');
}
subscribeNativeAuth(syncScope);
// A return from another app must see external writes. Capture runs before screen listeners.
window.addEventListener('focus', event => { if (event.target === window) cache.expire(); }, true);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') cache.clear(); });

function derived(name: RepositoryName, method: string, args: unknown[]) {
  const all = cache.peek<unknown[]>(name, allKey);
  if (!all) return undefined;
  if (name === 'medications') {
    const rows = all as SavedMedication[];
    if (method === 'listActive') return rows.filter(row => row.active !== false);
    if (method === 'getByIds') return (args[0] as string[]).flatMap(id => rows.filter(row => row.id === id));
  }
  if (name === 'medicationIntakes') {
    const rows = all as MedicationIntakeRecord[];
    if (method === 'listByDate') return rows.filter(row => row.date === args[0]);
    if (method === 'hasHistory') return rows.some(row => row.medicationId === args[0]);
  }
  if (name === 'moods') {
    const rows = all as MoodRecord[];
    if (method === 'findByDate') return rows.find(row => row.date === args[0]) ?? null;
    if (method === 'listRecent') return rows.filter(row => row.date >= String(args[0]) && row.date <= String(args[1]))
      .sort((a, b) => b.date.localeCompare(a.date) || b.recordedAt.localeCompare(a.recordedAt));
  }
  return undefined;
}
function repository<T>(name: RepositoryName, owner: string): T {
  const entries = (methods[name] as readonly string[]).map(method => [method, async (...args: unknown[]) => {
    syncScope();
    if (getNativeAuthSnapshot().user?.id !== owner) throw new Error('account_changed');
    const request = async () => {
      const response = await measureNative(`api.${name}.${method}`, () => fetchNativeApi('/api/repository',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({repository:name,method,args})}));
      const result = await response.json();
      if (result.code === 'DUPLICATE_MOOD') throw new DuplicateMoodRecordError();
      if (!response.ok) throw new Error('저장하거나 불러오지 못했어요. 다시 시도해주세요.');
      if (getNativeAuthSnapshot().user?.id !== owner) throw new Error('account_changed');
      return result.data;
    };
    if (writes.has(method)) {
      // Both boundaries matter: a timed-out mutation may still have committed remotely.
      cache.invalidate(name);
      try { return await request(); }
      finally { cache.invalidate(name); }
    }
    const existing = derived(name, method, args);
    if (existing !== undefined) return structuredClone(existing);
    const result = await cache.read(name, JSON.stringify([method, args]), request);
    if (getNativeAuthSnapshot().user?.id !== owner) throw new Error('account_changed');
    return structuredClone(result);
  }]);
  return Object.fromEntries([['storageBackend','supabase'],...entries]) as T;
}
/** Begin only after the existing remote authentication has completed. No UI/timing changes. */
export async function prefetchNativeHome() {
  const repositories = await getDataRepositories();
  await Promise.allSettled([
    repositories.medications.listAll(), repositories.medicationIntakes.listAll(),
    repositories.moods.listAll(), repositories.visitSchedules.getUpcoming(),
  ]);
}
export async function getDataRepositories() {
  const owner = getNativeAuthSnapshot().user?.id;
  if (!owner) throw new Error('authentication_required');
  return {
    medications:repository<MedicationRepository>('medications',owner),
    medicationIntakes:repository<MedicationIntakeRepository>('medicationIntakes',owner),
    moods:repository<MoodRepository>('moods',owner),
    visitSchedules:repository<VisitScheduleRepository>('visitSchedules',owner),
  };
}
export async function getMedicationRepository() { return (await getDataRepositories()).medications; }
export async function getMedicationIntakeRepository() { return (await getDataRepositories()).medicationIntakes; }
export async function getMoodRepository() { return (await getDataRepositories()).moods; }
export async function getVisitScheduleRepository() { return (await getDataRepositories()).visitSchedules; }
export async function runGuestDatasetSyncInBackground(): Promise<{ status: 'no-local-data' | 'failed' | 'merged' }> { return { status: 'no-local-data' }; }
