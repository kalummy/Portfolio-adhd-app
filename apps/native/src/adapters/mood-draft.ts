import { readMoodDraft as readSharedDraft, writeMoodDraft as writeSharedDraft, clearMoodDraft as clearSharedDraft } from '../../../../lib/mood-draft';
import { getNativeAuthSnapshot } from '../auth/runtime';
import { nativeMoodDrafts } from '../api/mood-draft-store';
export type { MoodDraftPhase } from '../../../../lib/mood-draft';
const storage = (provided: Storage) => provided === window.sessionStorage
  ? nativeMoodDrafts.storage(getNativeAuthSnapshot().user?.id ?? '') : provided;
export function readMoodDraft(provided: Storage, date: string) { return readSharedDraft(storage(provided), date); }
export function writeMoodDraft(provided: Storage, date: string, draft: Parameters<typeof writeSharedDraft>[2]) { return writeSharedDraft(storage(provided), date, draft); }
export function clearMoodDraft(provided: Storage, date: string) { return clearSharedDraft(storage(provided), date); }
