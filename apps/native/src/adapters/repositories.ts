import { PREVIEW_HOME_DATA } from '@/lib/preview-home-fixture';
import { addDaysToDateKey, getKstDateKey } from '@/lib/kst-date';
import type { HomeDataSet, MedicationIntakeRecord, SavedMedication } from '@/lib/types';
import type { MedicationRepository } from '@/lib/repositories/medications/types';
import type { MedicationIntakeRepository } from '@/lib/repositories/intake-records/types';
import { DuplicateMoodRecordError, type MoodRepository } from '@/lib/repositories/moods/types';
import type { VisitScheduleRepository } from '@/lib/repositories/visit-schedules/types';

const KEY = 'addi:native-shell:fixture:v1';
function seed(): HomeDataSet {
  const today = getKstDateKey();
  const yesterday = addDaysToDateKey(today, -1);
  const data = structuredClone(PREVIEW_HOME_DATA);
  data.medications = data.medications.map(m => ({ ...m, createdAt: `${yesterday}T00:00:00Z`, active: true }));
  data.intakeRecords = [{ id: `fixture:${today}`, medicationId: data.medications[0].id, date: today, taken: true, recordedAt: `${today}T01:30:00Z` }];
  data.moodRecords = data.moodRecords.map(m => ({ ...m, id: yesterday, date: yesterday, recordedAt: `${yesterday}T02:05:00Z` }));
  if (data.visitSchedule) data.visitSchedule.visitDate = addDaysToDateKey(today, 7);
  return data;
}
function read(): HomeDataSet {
  try { const value = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (value?.medications && value?.intakeRecords && value?.moodRecords) return value; } catch { /* fixture reset */ }
  const initial = seed(); localStorage.setItem(KEY, JSON.stringify(initial)); return initial;
}
function write(data: HomeDataSet) { localStorage.setItem(KEY, JSON.stringify(data)); }
function medication(data: HomeDataSet, id: string): SavedMedication {
  const value = data.medications.find(m => m.id === id); if (!value) throw new Error('fixture_medication_not_found'); return value;
}
// Legacy UI discriminator only. The adapter uses a namespaced fixture store, never web IndexedDB.
const medications: MedicationRepository = {
  storageBackend: 'indexeddb',
  listActive: async () => read().medications.filter(m => m.active !== false),
  listAll: async () => read().medications,
  getByIds: async ids => read().medications.filter(m => ids.includes(m.id)),
  createMany: async values => { const data = read(); data.medications.push(...values); write(data); return values; },
  deactivate: async id => { const data = read(); const value = medication(data, id); value.active = false; value.deactivatedAt = new Date().toISOString(); write(data); return value; },
  updateSchedule: async (id, patch) => { const data = read(); const value = medication(data, id); Object.assign(value, patch); write(data); return value; },
};
const medicationIntakes: MedicationIntakeRepository = {
  listAll: async () => read().intakeRecords,
  listByDate: async date => read().intakeRecords.filter(i => i.date === date),
  hasHistory: async id => read().intakeRecords.some(i => i.medicationId === id),
  setTaken: async (medicationId, date, taken) => {
    const data = read(); data.intakeRecords = data.intakeRecords.filter(i => !(i.medicationId === medicationId && i.date === date));
    const value: MedicationIntakeRecord | null = taken ? { id: `fixture:${date}:${medicationId}`, medicationId, date, taken, recordedAt: new Date().toISOString() } : null;
    if (value) data.intakeRecords.push(value); write(data); return value;
  },
  updateRecordedAt: async (id, date, recordedAt) => {
    const data = read(); const value = data.intakeRecords.find(i => i.medicationId === id && i.date === date);
    if (!value) throw new Error('fixture_intake_not_found'); value.recordedAt = recordedAt; write(data); return value;
  },
  migrateInitial: async () => { throw new Error('fixture_migration_disabled'); },
};
const moods: MoodRepository = {
  storageBackend: 'indexeddb',
  listAll: async () => read().moodRecords,
  listRecent: async (start, end) => read().moodRecords.filter(m => m.date >= start && m.date <= end),
  findByDate: async date => read().moodRecords.find(m => m.date === date) ?? null,
  save: async record => { const data = read(); if (data.moodRecords.some(m => m.date === record.date)) throw new DuplicateMoodRecordError(); const value = { ...record, id: `fixture:${record.date}` }; data.moodRecords.push(value); write(data); return value; },
  deleteByDate: async date => { const data = read(); data.moodRecords = data.moodRecords.filter(m => m.date !== date); write(data); },
};
const visitSchedules: VisitScheduleRepository = {
  getUpcoming: async () => read().visitSchedule ?? null,
  saveUpcoming: async visitDate => { const data = read(); const now = new Date().toISOString(); const value = { id: 'upcoming' as const, visitDate, createdAt: data.visitSchedule?.createdAt ?? now, updatedAt: now }; data.visitSchedule = value; write(data); return value; },
  deleteUpcoming: async () => { const data = read(); data.visitSchedule = null; write(data); },
};
export async function getDataRepositories() { return { medications, medicationIntakes, moods, visitSchedules }; }
export async function getMoodRepository() { return moods; }
export async function getVisitScheduleRepository() { return visitSchedules; }
export async function getMedicationRepository() { return medications; }
export async function getMedicationIntakeRepository() { return medicationIntakes; }
export async function runGuestDatasetSyncInBackground(): Promise<{ status: 'no-local-data' | 'failed' | 'merged' }> { return { status: 'no-local-data' as const }; }
