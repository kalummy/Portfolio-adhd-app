import { readMoodDraft as readSharedDraft, writeMoodDraft as writeSharedDraft, clearMoodDraft as clearSharedDraft } from '../../../../lib/mood-draft';
export type { MoodDraftPhase } from '../../../../lib/mood-draft';
// Disposable fixture persistence across WebView process death; Phase 2 must replace this
// with account-scoped storage and an explicit logout/deletion policy before real data.
const key = (date: string) => `native-prototype:${date}`;
export function readMoodDraft(_storage: Storage, date: string) { return readSharedDraft(localStorage, key(date)); }
export function writeMoodDraft(_storage: Storage, date: string, draft: Parameters<typeof writeSharedDraft>[2]) { return writeSharedDraft(localStorage, key(date), draft); }
export function clearMoodDraft(_storage: Storage, date: string) { return clearSharedDraft(localStorage, key(date)); }
