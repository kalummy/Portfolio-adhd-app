import type { MedicationRepository } from '@/lib/repositories/medications/types';
import type { MedicationIntakeRepository } from '@/lib/repositories/intake-records/types';
import { DuplicateMoodRecordError, type MoodRepository } from '@/lib/repositories/moods/types';
import type { VisitScheduleRepository } from '@/lib/repositories/visit-schedules/types';
import { methods, type RepositoryName } from '../../../../lib/native-api/contracts';
import { fetchNativeApi } from '../api/client';
import { getNativeAuthSnapshot } from '../auth/runtime';
function repository<T>(name: RepositoryName, owner: string): T {
  const entries = (methods[name] as readonly string[]).map(method => [method, async (...args: unknown[]) => {
    if (getNativeAuthSnapshot().user?.id !== owner) throw new Error('account_changed');
    const response = await fetchNativeApi('/api/repository',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({repository:name,method,args})});
    const result = await response.json();
    if (result.code === 'DUPLICATE_MOOD') throw new DuplicateMoodRecordError();
    if (!response.ok) throw new Error('저장하거나 불러오지 못했어요. 다시 시도해주세요.');
    if (getNativeAuthSnapshot().user?.id !== owner) throw new Error('account_changed');
    return result.data;
  }]);
  return Object.fromEntries([['storageBackend','supabase'],...entries]) as T;
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
