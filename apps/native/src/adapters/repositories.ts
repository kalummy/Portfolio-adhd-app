import { createSupabaseMedicationRepository } from '@/lib/repositories/medications/supabase';
import { createSupabaseMedicationIntakeRepository } from '@/lib/repositories/intake-records/supabase';
import { createSupabaseMoodRepository } from '@/lib/repositories/moods/supabase';
import { createSupabaseVisitScheduleRepository } from '@/lib/repositories/visit-schedules/supabase';
import { requireNativeUser } from '../auth/runtime';
/** Phase 2 verifies existing account data without enabling health-record mutations. */
function readOnly<T extends object>(repository: T): T {
  const reads = new Set(['listAll', 'listActive', 'listRecent', 'listByDate', 'findByDate', 'findByMedicationAndDate', 'getByIds', 'getUpcoming', 'hasHistory']);
  return new Proxy(repository, { get(target, key, receiver) {
    const value = Reflect.get(target, key, receiver);
    if (typeof value !== 'function') return value;
    return async (...args: unknown[]) => {
      if (!reads.has(String(key))) throw new Error('Phase 2에서는 기록을 조회할 수 있어요.');
      await requireNativeUser();
      return (value as (...values: unknown[]) => unknown)(...args);
    };
  } });
}
export async function getDataRepositories() {
  const user = await requireNativeUser();
  return {
    medications: readOnly(createSupabaseMedicationRepository(user.id)),
    medicationIntakes: readOnly(createSupabaseMedicationIntakeRepository(user.id)),
    moods: readOnly(createSupabaseMoodRepository(user.id)),
    visitSchedules: readOnly(createSupabaseVisitScheduleRepository(user.id)),
  };
}
export async function getMedicationRepository() { return (await getDataRepositories()).medications; }
export async function getMedicationIntakeRepository() { return (await getDataRepositories()).medicationIntakes; }
export async function getMoodRepository() { return (await getDataRepositories()).moods; }
export async function getVisitScheduleRepository() { return (await getDataRepositories()).visitSchedules; }
export async function runGuestDatasetSyncInBackground(): Promise<{ status: 'no-local-data' | 'failed' | 'merged' }> { return { status: 'no-local-data' }; }
