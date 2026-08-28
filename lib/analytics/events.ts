"use client";

import { getAuthState } from "@/lib/auth/client";
import { createClientId } from "../client-id";
import { readMoodDraft } from "../mood-draft";
import { MOOD_FLOW_VERSION, isMoodAttemptId, type MoodAnalysisFailureType, type MoodSaveFailureType, type MoodStorageBackend } from "./mood-contract";
import { dateKeyDayDifference, getKstDateKey } from "@/lib/kst-date";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  addDeduplicationKey,
  createMedicationAttempt,
  createMoodAttempt,
  createVisitAttempt,
  markMedicationAdded,
  markMedicationAttemptStarted,
  markMoodAttemptStarted,
  markMoodResultViewed,
  markMoodSaved,
  markMoodStepCompleted,
  markVisitAttemptCompleted,
  markVisitAttemptStarted,
  type MedicationAttemptState,
  type MoodAttemptState,
  type VisitAttemptState,
} from "./attempts";
import { trackAnalyticsEvent } from "./mixpanel";
import { isAnalyticsPathBlocked } from "./path-policy";
import {
  createScreenViewTransition,
  type AnalyticsScreenName,
} from "./screens";
import type {
  AnalyticsCatId,
  AnalyticsEventName,
  AnalyticsEventProperties,
  AnalyticsMedicationScheduleType,
  DateDirection,
  MedicationAddSource,
  MedicationScheduleChangedFields,
  MoodSource,
  MoodStep,
} from "./schema";

const LOGIN_COMPLETED_STORAGE_KEY = "addi:analytics:login-completed:v1";
const MEDICATION_ATTEMPT_STORAGE_KEY = "addi:analytics:medication-attempt:v1";
const MOOD_ATTEMPT_STORAGE_KEY = "addi:analytics:mood-attempt:v2:";
const VISIT_ATTEMPT_STORAGE_KEY = "addi:analytics:visit-attempt:v1";
const INTAKE_DEDUPLICATION_STORAGE_KEY = "addi:analytics:intake-dedupe:v1";
const START_THROTTLE_MS = 1_000;
const MOOD_SAVE_ANALYTICS_WAIT_MS = 500;

let analyticsQueue: Promise<unknown> = Promise.resolve();
let lastMedicationStartAt = 0;
let lastMedicationManagementOpenAt = 0;
// Memory is the fallback for blocked sessionStorage, not a second attempt lifecycle.
const moodAttempts = new Map<string, MoodAttemptState>();
export type MoodAttemptHandle = Pick<MoodAttemptState, "id" | "dateKey"> | null;
type MoodAuthState = "guest" | "member";
// Attempt-scoped, memory-only repository context; never an auth/authorization cache.
const moodAuthStates = new Map<string, MoodAuthState>();
// Handles for entries already in analyticsQueue. SDK is attempted once only:
// no persistence, ACK waiting, retry, or separate outbox.
const pendingMoodEvents = new Set<{ attemptId: string; dispatch: (auth: MoodAuthState) => void }>();

function reuseMoodRepositoryAuth(attemptId: string, backend: MoodStorageBackend) {
  if (backend !== "indexeddb" && backend !== "supabase") return;
  const auth = backend === "supabase" ? "member" : "guest";
  moodAuthStates.set(attemptId, auth);
  // Preserve order within this attempt even when the shared queue is blocked.
  for (const entry of pendingMoodEvents) {
    if (entry.attemptId === attemptId) entry.dispatch(auth);
  }
}

const screenTrackingGlobal = globalThis as typeof globalThis & {
  __addiScreenTrackingState?: { previousScreen: AnalyticsScreenName | null };
};

const screenTrackingState = screenTrackingGlobal.__addiScreenTrackingState ??= {
  previousScreen: null,
};

function readSessionValue(key: string) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionValue(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Analytics state must never block the product flow.
  }
}

function removeSessionValue(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Analytics state must never block the product flow.
  }
}

function readMedicationAttempt(): MedicationAttemptState | null {
  try {
    const parsed = JSON.parse(readSessionValue(MEDICATION_ATTEMPT_STORAGE_KEY) ?? "null") as Partial<MedicationAttemptState> | null;
    if (!parsed || typeof parsed.active !== "boolean" || typeof parsed.added !== "boolean" || typeof parsed.started !== "boolean") {
      return null;
    }
    return parsed as MedicationAttemptState;
  } catch {
    return null;
  }
}

function writeMedicationAttempt(state: MedicationAttemptState) {
  writeSessionValue(MEDICATION_ATTEMPT_STORAGE_KEY, JSON.stringify(state));
}

function isMoodSource(value: unknown): value is MoodSource {
  return value === "home" || value === "mood_history";
}

function readMoodAttempt(dateKey: string): MoodAttemptState | null {
  const memory = moodAttempts.get(dateKey);
  if (memory) return memory;
  try {
    const parsed = JSON.parse(readSessionValue(MOOD_ATTEMPT_STORAGE_KEY + dateKey) ?? "null") as Partial<MoodAttemptState> | null;
    if (
      !parsed
      || !isMoodAttemptId(parsed.id)
      || parsed.dateKey !== dateKey
      || typeof parsed.completed !== "boolean"
      || typeof parsed.rewardRevealed !== "boolean"
      || typeof parsed.active !== "boolean"
      || typeof parsed.resultViewed !== "boolean"
      || typeof parsed.saved !== "boolean"
      || typeof parsed.started !== "boolean"
      || !isMoodSource(parsed.source)
      || !Array.isArray(parsed.completedSteps)
      || !parsed.completedSteps.every((step) => step === 1 || step === 2 || step === 3 || step === 4)
    ) {
      return null;
    }
    moodAttempts.set(dateKey, parsed as MoodAttemptState);
    return parsed as MoodAttemptState;
  } catch {
    return null;
  }
}

function writeMoodAttempt(state: MoodAttemptState) {
  moodAttempts.set(state.dateKey, state);
  writeSessionValue(MOOD_ATTEMPT_STORAGE_KEY + state.dateKey, JSON.stringify(state));
}

function readVisitAttempt(): VisitAttemptState | null {
  try {
    const parsed = JSON.parse(readSessionValue(VISIT_ATTEMPT_STORAGE_KEY) ?? "null") as Partial<VisitAttemptState> | null;
    if (!parsed || typeof parsed.active !== "boolean" || typeof parsed.started !== "boolean") {
      return null;
    }
    return parsed as VisitAttemptState;
  } catch {
    return null;
  }
}

function writeVisitAttempt(state: VisitAttemptState) {
  writeSessionValue(VISIT_ATTEMPT_STORAGE_KEY, JSON.stringify(state));
}

async function resolveAnalyticsAuthState(): Promise<"guest" | "member"> {
  if (!isSupabaseConfigured()) return "guest";
  try {
    const state = await getAuthState();
    return state.isAuthenticated ? "member" : "guest";
  } catch {
    return "guest";
  }
}

function queueResolvedEvent<T extends AnalyticsEventName>(
  eventName: T,
  properties: AnalyticsEventProperties<T>,
  pathnameOverride?: string,
) {
  if (typeof window === "undefined" || isAnalyticsPathBlocked(window.location.pathname)) {
    return Promise.resolve();
  }
  const attemptId = (properties as { mood_attempt_id?: string }).mood_attempt_id;
  if (attemptId) {
    const pathname = pathnameOverride ?? window.location.pathname;
    let dispatched = false;
    let complete!: () => void;
    const delivered = new Promise<void>((resolve) => { complete = resolve; });
    const entry = { attemptId, dispatch(auth: MoodAuthState) {
      if (dispatched) return;
      dispatched = true;
      pendingMoodEvents.delete(entry);
      try { trackAnalyticsEvent(eventName, auth, properties, pathname); }
      catch { /* SDK failure must never affect the product. */ }
      finally { complete(); }
    } };
    pendingMoodEvents.add(entry);
    const knownAuth = moodAuthStates.get(attemptId);
    if (knownAuth) {
      entry.dispatch(knownAuth);
    } else {
      analyticsQueue = analyticsQueue.then(async () => {
        if (!dispatched) entry.dispatch(await resolveAnalyticsAuthState());
      }).catch(() => { entry.dispatch("guest"); });
    }
    return delivered;
  }
  analyticsQueue = analyticsQueue
    .then(async () => {
      const authState = await resolveAnalyticsAuthState();
      trackAnalyticsEvent(eventName, authState, properties, pathnameOverride);
    })
    .catch(() => undefined);
  return analyticsQueue;
}

export function trackScreenViewed(pathname: string) {
  if (typeof window === "undefined" || isAnalyticsPathBlocked(pathname)) return;
  const transition = createScreenViewTransition(screenTrackingState.previousScreen, pathname);
  screenTrackingState.previousScreen = transition.currentScreen;
  if (!transition.properties) return;
  queueResolvedEvent("screen_viewed", transition.properties, pathname);
}

export function trackLoginStarted() {
  removeSessionValue(LOGIN_COMPLETED_STORAGE_KEY);
  return trackAnalyticsEvent("login_started", "guest", {});
}

export function trackLoginCompleted() {
  if (readSessionValue(LOGIN_COMPLETED_STORAGE_KEY) === "1") return false;
  const tracked = trackAnalyticsEvent("login_completed", "member", {});
  if (tracked) writeSessionValue(LOGIN_COMPLETED_STORAGE_KEY, "1");
  return tracked;
}

function emitMedicationAttemptStarted(source: MedicationAddSource, state: MedicationAttemptState) {
  const result = markMedicationAttemptStarted(state);
  writeMedicationAttempt(result.state);
  if (result.shouldTrack) {
    queueResolvedEvent("medication_add_started", { source });
  }
}

export function startMedicationAddAttempt(source: MedicationAddSource) {
  const now = Date.now();
  if (now - lastMedicationStartAt < START_THROTTLE_MS) return;
  lastMedicationStartAt = now;
  emitMedicationAttemptStarted(source, createMedicationAttempt());
}

export function ensureMedicationAddAttempt(source: MedicationAddSource) {
  const current = readMedicationAttempt();
  if (current?.active && current.started) return;
  emitMedicationAttemptStarted(source, createMedicationAttempt());
}

export function trackMedicationAdded() {
  const current = readMedicationAttempt() ?? createMedicationAttempt();
  const result = markMedicationAdded(current);
  writeMedicationAttempt(result.state);
  if (result.shouldTrack) queueResolvedEvent("medication_added", {});
}

function toAnalyticsMedicationScheduleType(
  schedule: "daily" | "as-needed" | "bedtime",
): AnalyticsMedicationScheduleType {
  return schedule === "as-needed" ? "as_needed" : schedule;
}

export function trackMedicationManagementOpened(medicationCount: number) {
  const now = Date.now();
  if (now - lastMedicationManagementOpenAt < START_THROTTLE_MS) return;
  lastMedicationManagementOpenAt = now;
  queueResolvedEvent("medication_management_opened", {
    source: "home",
    medication_count: medicationCount,
  });
}

export function trackMedicationScheduleEditOpened(
  schedule: "daily" | "as-needed" | "bedtime",
  hasScheduledTime: boolean,
) {
  queueResolvedEvent("medication_schedule_edit_opened", {
    source: "medication_management",
    schedule_type: toAnalyticsMedicationScheduleType(schedule),
    has_scheduled_time: hasScheduledTime,
  });
}

export function trackMedicationScheduleUpdated({
  changedFields,
  previousSchedule,
  newSchedule,
  hadScheduledTimeBefore,
  hasScheduledTimeAfter,
}: {
  changedFields: MedicationScheduleChangedFields;
  previousSchedule: "daily" | "as-needed" | "bedtime";
  newSchedule: "daily" | "as-needed" | "bedtime";
  hadScheduledTimeBefore: boolean;
  hasScheduledTimeAfter: boolean;
}) {
  queueResolvedEvent("medication_schedule_updated", {
    source: "medication_management",
    changed_fields: changedFields,
    previous_schedule_type: toAnalyticsMedicationScheduleType(previousSchedule),
    new_schedule_type: toAnalyticsMedicationScheduleType(newSchedule),
    had_scheduled_time_before: hadScheduledTimeBefore,
    has_scheduled_time_after: hasScheduledTimeAfter,
  });
}

export function trackMedicationDeleteConfirmed(hasIntakeHistory: boolean) {
  queueResolvedEvent("medication_delete_confirmed", {
    source: "medication_management",
    has_intake_history: hasIntakeHistory,
  });
}

async function createIntakeDeduplicationKey(medicationId: string, date: string) {
  if (!window.crypto?.subtle) return null;
  const bytes = new TextEncoder().encode(`${medicationId}\u0000${date}`);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readIntakeDeduplicationKeys() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(INTAKE_DEDUPLICATION_STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

export async function trackMedicationTakenOnce(medicationId: string, date: string) {
  try {
    const key = await createIntakeDeduplicationKey(medicationId, date);
    if (!key) return;
    const result = addDeduplicationKey(readIntakeDeduplicationKeys(), key);
    if (!result.shouldTrack) return;
    window.localStorage.setItem(INTAKE_DEDUPLICATION_STORAGE_KEY, JSON.stringify(result.keys));
    queueResolvedEvent("medication_taken", {});
  } catch {
    // Analytics state must never block the persisted intake action.
  }
}

function emitMoodAttemptStarted(state: MoodAttemptState) {
  const result = markMoodAttemptStarted(state);
  writeMoodAttempt(result.state);
  if (result.shouldTrack) {
    queueResolvedEvent("mood_started", { ...moodProperties(state), source: result.state.source });
  }
}

export function startMoodAttempt(source: MoodSource, dateKey: string) {
  let draftId: string | undefined;
  try { draftId = readMoodDraft(window.sessionStorage, dateKey)?.moodAttemptId; } catch { /* optional storage */ }
  return ensureMoodAttempt(source, dateKey, draftId);
}

export function ensureMoodAttempt(source: MoodSource, dateKey: string, draftId?: string, backend: MoodStorageBackend = "unknown"): MoodAttemptHandle {
  try {
    const current = readMoodAttempt(dateKey);
    const reusable = current?.active && (!draftId || current.id === draftId);
    const state = reusable ? current : createMoodAttempt(source,
      isMoodAttemptId(draftId) && current?.id !== draftId ? draftId : createClientId(), dateKey);
    reuseMoodRepositoryAuth(state.id, backend);
    emitMoodAttemptStarted(state);
    return { id: state.id, dateKey };
  } catch {
    // Analytics failure must not redirect or prevent entry into the mood flow.
    return null;
  }
}

export function endMoodAttempt(handle: MoodAttemptHandle) {
  withMoodAttempt(handle, (state) => {
    writeMoodAttempt({ ...state, active: false });
    moodAuthStates.delete(state.id);
  });
}

function moodProperties(state: NonNullable<MoodAttemptHandle>) {
  return { mood_attempt_id: state.id, flow_version: MOOD_FLOW_VERSION };
}

function withMoodAttempt(handle: MoodAttemptHandle, action: (state: MoodAttemptState) => unknown) {
  try {
    if (!handle) return;
    const state = readMoodAttempt(handle.dateKey);
    if (state?.id === handle.id && state.active) action(state);
  } catch { /* Analytics must never block the product flow. */ }
}

export function trackMoodStepCompleted(step: MoodStep, handle: MoodAttemptHandle) {
  withMoodAttempt(handle, (state) => {
    const result = markMoodStepCompleted(state, step);
    writeMoodAttempt(result.state);
    if (result.shouldTrack) queueResolvedEvent("mood_step_completed", { ...moodProperties(state), step });
  });
}

export function trackMoodResultViewed(handle: MoodAttemptHandle) {
  withMoodAttempt(handle, (state) => {
    const result = markMoodResultViewed(state);
    writeMoodAttempt(result.state);
    if (result.shouldTrack) queueResolvedEvent("mood_result_viewed", moodProperties(state));
  });
}

export function trackMoodCompleted(handle: MoodAttemptHandle) {
  withMoodAttempt(handle, (state) => {
    if (state.completed) return;
    writeMoodAttempt({ ...state, completed: true });
    queueResolvedEvent("mood_completed", moodProperties(state));
  });
}
export function trackMoodCatRewardRevealed(catId: AnalyticsCatId, handle: MoodAttemptHandle) {
  withMoodAttempt(handle, (state) => {
    if (state.rewardRevealed) return;
    writeMoodAttempt({ ...state, rewardRevealed: true });
    queueResolvedEvent("cat_reward_revealed", { ...moodProperties(state), cat_id: catId });
  });
}
export function trackMoodAnalysisStarted(handle: MoodAttemptHandle) {
  withMoodAttempt(handle, (state) => queueResolvedEvent("mood_analysis_started", moodProperties(state)));
}
export function trackMoodAnalysisSucceeded(handle: MoodAttemptHandle, durationMs: number) {
  withMoodAttempt(handle, (state) => queueResolvedEvent("mood_analysis_succeeded", { ...moodProperties(state), duration_ms: durationMs }));
}
export function trackMoodAnalysisFailed(handle: MoodAttemptHandle, durationMs: number, failureType: MoodAnalysisFailureType) {
  withMoodAttempt(handle, (state) => queueResolvedEvent("mood_analysis_failed", { ...moodProperties(state), duration_ms: durationMs, failure_type: failureType }));
}
export function trackMoodSaveClicked(handle: MoodAttemptHandle) {
  withMoodAttempt(handle, (state) => queueResolvedEvent("mood_save_clicked", moodProperties(state)));
}
export function trackMoodSaveFailed(handle: MoodAttemptHandle, failureType: MoodSaveFailureType, storageBackend: MoodStorageBackend) {
  withMoodAttempt(handle, (state) => queueResolvedEvent("mood_save_failed", { ...moodProperties(state), failure_type: failureType, storage_backend: storageBackend }));
}
export function trackCatCollectionViewed() { return queueResolvedEvent("cat_collection_viewed", {}); }
export function trackMoodReportViewed() { return queueResolvedEvent("mood_report_viewed", {}); }
export function trackMoodAnalysisRetried() { return queueResolvedEvent("mood_analysis_retried", {}); }

export function trackMoodSaved(handle: MoodAttemptHandle, backend: MoodStorageBackend = "unknown") {
  let queued = Promise.resolve<unknown>(undefined);
  withMoodAttempt(handle, (state) => {
    // The successful repository is the current source of truth. No extra auth
    // request is needed before handing this attempt's events to the SDK.
    reuseMoodRepositoryAuth(state.id, backend);
    const result = markMoodSaved(state);
    writeMoodAttempt(result.state);
    if (result.shouldTrack) queued = queueResolvedEvent("mood_saved", moodProperties(state));
    moodAuthStates.delete(state.id);
  });
  // Preserve the pre-navigation queue drain, but a stalled auth/analytics call
  // must never leave a successfully saved mood stuck on the result screen.
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, MOOD_SAVE_ANALYTICS_WAIT_MS);
    void queued.finally(() => { clearTimeout(timer); resolve(); });
  });
}

function emitVisitAttemptStarted(state: VisitAttemptState) {
  const result = markVisitAttemptStarted(state);
  writeVisitAttempt(result.state);
  if (result.shouldTrack) queueResolvedEvent("visit_add_started", {});
}

export function startVisitAddAttempt() {
  const current = readVisitAttempt();
  if (current?.active && current.started) return;
  emitVisitAttemptStarted(createVisitAttempt());
}

export function ensureVisitAddAttempt() {
  const current = readVisitAttempt();
  if (current?.active && current.started) return;
  emitVisitAttemptStarted(createVisitAttempt());
}

export function completeVisitAddAttempt() {
  const current = readVisitAttempt();
  if (!current) return;
  writeVisitAttempt(markVisitAttemptCompleted(current));
}

export function trackVisitAdded() {
  queueResolvedEvent("visit_added", {});
}

function getDateDirection(daysFromToday: number): DateDirection {
  if (daysFromToday < 0) return "past";
  if (daysFromToday > 0) return "future";
  return "today";
}

function getHomeDateSelectionProperties(selectedDate: string) {
  const daysFromToday = dateKeyDayDifference(selectedDate, getKstDateKey());
  return {
    source: "home" as const,
    selected_date: selectedDate,
    date_direction: getDateDirection(daysFromToday),
    days_from_today: daysFromToday,
  };
}

export function trackHomeDatePickerOpened(currentDate: string) {
  queueResolvedEvent("home_date_picker_opened", {
    source: "home",
    current_date: currentDate,
  });
}

export function trackHomeDateSelected(selectedDate: string) {
  queueResolvedEvent("home_date_selected", getHomeDateSelectionProperties(selectedDate));
}

export function trackHomeDateTodayClicked() {
  queueResolvedEvent("home_date_today_clicked", { source: "home" });
}

export function trackHomeDateChangeConfirmed(previousDate: string, selectedDate: string) {
  if (previousDate === selectedDate) return;
  queueResolvedEvent("home_date_change_confirmed", {
    ...getHomeDateSelectionProperties(selectedDate),
    previous_date: previousDate,
  });
}
