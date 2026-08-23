"use client";

import { getAuthState } from "@/lib/auth/client";
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
import type {
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
const MOOD_ATTEMPT_STORAGE_KEY = "addi:analytics:mood-attempt:v1";
const VISIT_ATTEMPT_STORAGE_KEY = "addi:analytics:visit-attempt:v1";
const INTAKE_DEDUPLICATION_STORAGE_KEY = "addi:analytics:intake-dedupe:v1";
const START_THROTTLE_MS = 1_000;

let analyticsQueue: Promise<unknown> = Promise.resolve();
let lastMedicationStartAt = 0;
let lastMedicationManagementOpenAt = 0;
let lastMoodStartAt = 0;

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

function readMoodAttempt(): MoodAttemptState | null {
  try {
    const parsed = JSON.parse(readSessionValue(MOOD_ATTEMPT_STORAGE_KEY) ?? "null") as Partial<MoodAttemptState> | null;
    if (
      !parsed
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
    return parsed as MoodAttemptState;
  } catch {
    return null;
  }
}

function writeMoodAttempt(state: MoodAttemptState) {
  writeSessionValue(MOOD_ATTEMPT_STORAGE_KEY, JSON.stringify(state));
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
) {
  if (typeof window === "undefined" || isAnalyticsPathBlocked(window.location.pathname)) {
    return Promise.resolve();
  }
  analyticsQueue = analyticsQueue
    .then(async () => {
      const authState = await resolveAnalyticsAuthState();
      trackAnalyticsEvent(eventName, authState, properties);
    })
    .catch(() => undefined);
  return analyticsQueue;
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
    queueResolvedEvent("mood_started", { source: result.state.source });
  }
}

export function startMoodAttempt(source: MoodSource) {
  const now = Date.now();
  if (now - lastMoodStartAt < START_THROTTLE_MS) return;
  lastMoodStartAt = now;
  emitMoodAttemptStarted(createMoodAttempt(source));
}

export function ensureMoodAttempt(source: MoodSource) {
  const current = readMoodAttempt();
  if (current?.active && current.started) return;
  emitMoodAttemptStarted(createMoodAttempt(source));
}

export function restartMoodAttempt() {
  const source = readMoodAttempt()?.source ?? "home";
  emitMoodAttemptStarted(createMoodAttempt(source));
}

export function trackMoodStepCompleted(step: MoodStep) {
  const current = readMoodAttempt() ?? createMoodAttempt("home");
  if (!current.started) emitMoodAttemptStarted(current);
  const started = readMoodAttempt() ?? current;
  const result = markMoodStepCompleted(started, step);
  writeMoodAttempt(result.state);
  if (result.shouldTrack) queueResolvedEvent("mood_step_completed", { step });
}

export function trackMoodResultViewed() {
  const current = readMoodAttempt() ?? createMoodAttempt("home");
  const result = markMoodResultViewed(current);
  writeMoodAttempt(result.state);
  if (result.shouldTrack) queueResolvedEvent("mood_result_viewed", {});
}

export function trackMoodSaved() {
  const current = readMoodAttempt() ?? createMoodAttempt("home");
  const result = markMoodSaved(current);
  writeMoodAttempt(result.state);
  if (result.shouldTrack) return queueResolvedEvent("mood_saved", {});
  return Promise.resolve();
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
