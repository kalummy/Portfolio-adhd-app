import { isValidDateKey } from '../kst-date';
import { MOOD_PRESENTATIONS } from '../mood-summary';
import type { SavedMedication } from '../types';
import type { NewMoodRecord } from '../repositories/moods/types';

export const NATIVE_API_ORIGIN = 'https://ohobxicxchkaisxxswkk.supabase.co';
export const NATIVE_API_PREFIX = '/functions/v1/native-api';
export const MAX_BODY_BYTES = 96 * 1024;
export class NativeRequestError extends Error { constructor() { super('INVALID_REQUEST'); } }
const fail = (): never => { throw new NativeRequestError(); };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 2000): v is string => typeof v === 'string' && v.length <= max;
const id = (v: unknown): v is string => text(v, 100) && /^[a-zA-Z0-9_-]+$/.test(v);
const date = (v: unknown): v is string => typeof v === 'string' && isValidDateKey(v);
const timestamp = (v: unknown) => text(v, 40) && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v));
const schedule = (v: unknown) => ['daily', 'as-needed', 'bedtime'].includes(String(v));
const time = (v: unknown) => v === null || (text(v, 5) && /^([01]\d|2[0-3]):[0-5]\d$/.test(v));
function rejectOwner(v: unknown): void {
  if (Array.isArray(v)) { v.forEach(rejectOwner); return; }
  if (!record(v)) return;
  for (const [key, value] of Object.entries(v)) {
    if (['user_id', 'userId', 'owner', '__proto__', 'constructor', 'prototype'].includes(key)) fail();
    rejectOwner(value);
  }
}
function medication(v: unknown): v is SavedMedication {
  if (!record(v) || !id(v.id) || !text(v.name, 200) || !v.name.trim() || !text(v.imagePath, 2048)
    || !schedule(v.schedule) || !['search','manual','photo'].includes(String(v.registrationMethod))
    || typeof v.strengthValue !== 'number' || !Number.isFinite(v.strengthValue) || v.strengthValue <= 0
    || v.strengthUnit !== 'mg' || !timestamp(v.createdAt)) return false;
  if (v.scheduledTime !== undefined && !time(v.scheduledTime)) return false;
  if (v.active !== undefined && typeof v.active !== 'boolean') return false;
  if (v.deactivatedAt !== undefined && !timestamp(v.deactivatedAt)) return false;
  for (const [key, value] of Object.entries(v)) {
    if (['searchKeywords'].includes(key) && (!Array.isArray(value) || value.length > 100 || !value.every(x => text(x, 200)))) return false;
    if (!['strengthValue','active','scheduledTime','searchKeywords'].includes(key) && !text(value, 2048)) return false;
  }
  return true;
}
function mood(v: unknown): v is NewMoodRecord {
  if (!record(v) || !date(v.date) || !timestamp(v.recordedAt) || !Object.hasOwn(MOOD_PRESENTATIONS, String(v.mood))
    || (!text(v.memberSummary, 300) || !v.memberSummary.trim()) || !text(v.moodLabel, 100)) return false;
  if (v.clinicPhrase !== undefined && (!text(v.clinicPhrase, 300) || !v.clinicPhrase.trim())) return false;
  if (v.details !== undefined) {
    if (!record(v.details) || !record(v.details.customText) || !record(v.details.medicationEffectTimings)) return false;
    for (const key of ['medicationEffects','concentrationStates','moods','relationships']) {
      const a = v.details[key];
      if (a !== undefined && (!Array.isArray(a) || a.length > 100 || !a.every(x => text(x, 100)))) return false;
    }
    if (!Object.values(v.details.customText).every(x => text(x, 2000))) return false;
    if (!Object.values(v.details.medicationEffectTimings).every(a => Array.isArray(a) && a.length <= 20 && a.every(x => text(x, 100)))) return false;
  }
  return true;
}
export const methods = {
  medications: ['listAll','listActive','createMany','deactivate','updateSchedule','getByIds'],
  medicationIntakes: ['listAll','listByDate','hasHistory','setTaken','updateRecordedAt'],
  moods: ['listAll','listRecent','findByDate','save','deleteByDate'],
  visitSchedules: ['getUpcoming','saveUpcoming','deleteUpcoming'],
} as const;
export type RepositoryName = keyof typeof methods;
export function validateRepositoryRequest(body: unknown) {
  rejectOwner(body);
  if (!record(body) || Object.keys(body).some(k => !['repository','method','args'].includes(k))
    || !Object.hasOwn(methods, String(body.repository)) || !Array.isArray(body.args)) return fail();
  const repository = body.repository as RepositoryName;
  const method = String(body.method);
  if (!(methods[repository] as readonly string[]).includes(method)) return fail();
  const a = body.args;
  const zero = ['listAll','listActive','getUpcoming','deleteUpcoming'];
  let valid = zero.includes(method) && a.length === 0;
  if (method === 'createMany') valid = a.length === 1 && Array.isArray(a[0]) && a[0].length <= 50 && a[0].every(medication);
  if (method === 'getByIds') valid = a.length === 1 && Array.isArray(a[0]) && a[0].length <= 500 && a[0].every(id);
  if (['deactivate','hasHistory'].includes(method)) valid = a.length === 1 && id(a[0]);
  if (['listByDate','findByDate','deleteByDate','saveUpcoming'].includes(method)) valid = a.length === 1 && date(a[0]);
  if (method === 'listRecent') valid = a.length === 2 && date(a[0]) && date(a[1]) && a[0] <= a[1];
  if (method === 'setTaken') valid = a.length === 3 && id(a[0]) && date(a[1]) && typeof a[2] === 'boolean';
  if (method === 'updateRecordedAt') valid = a.length === 3 && id(a[0]) && date(a[1]) && timestamp(a[2]);
  if (method === 'updateSchedule') valid = a.length === 2 && id(a[0]) && record(a[1]) && Object.keys(a[1]).length > 0
    && Object.keys(a[1]).every(k => ['schedule','scheduledTime'].includes(k))
    && (a[1].schedule === undefined || schedule(a[1].schedule)) && (a[1].scheduledTime === undefined || time(a[1].scheduledTime));
  if (method === 'save') valid = a.length === 1 && mood(a[0]);
  if (!valid) return fail();
  return { repository, method, args: a };
}
/** Both the JS and Android network boundaries admit only this finite API surface. */
export function nativeApiPath(path: string) {
  return /^\/api\/(repository|account|moods\/analyze|medications\/(search|manual-match|\d{9}|image\/\d{9}))$/.test(path);
}
