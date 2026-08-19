import type { MoodSource, MoodStep } from "./schema";

export type MoodAttemptState = {
  active: boolean;
  completedSteps: MoodStep[];
  resultViewed: boolean;
  saved: boolean;
  source: MoodSource;
  started: boolean;
};

export function createMoodAttempt(source: MoodSource): MoodAttemptState {
  return {
    active: true,
    completedSteps: [],
    resultViewed: false,
    saved: false,
    source,
    started: false,
  };
}

export function markMoodAttemptStarted(state: MoodAttemptState) {
  if (state.started) return { state, shouldTrack: false };
  return { state: { ...state, started: true }, shouldTrack: true };
}

export function markMoodStepCompleted(state: MoodAttemptState, step: MoodStep) {
  if (state.completedSteps.includes(step)) return { state, shouldTrack: false };
  return {
    state: { ...state, completedSteps: [...state.completedSteps, step] },
    shouldTrack: true,
  };
}

export function markMoodResultViewed(state: MoodAttemptState) {
  if (state.resultViewed) return { state, shouldTrack: false };
  return { state: { ...state, resultViewed: true }, shouldTrack: true };
}

export function markMoodSaved(state: MoodAttemptState) {
  if (state.saved) return { state, shouldTrack: false };
  return {
    state: { ...state, active: false, saved: true },
    shouldTrack: true,
  };
}

export type MedicationAttemptState = {
  active: boolean;
  added: boolean;
  started: boolean;
};

export function createMedicationAttempt(): MedicationAttemptState {
  return { active: true, added: false, started: false };
}

export function markMedicationAttemptStarted(state: MedicationAttemptState) {
  if (state.started) return { state, shouldTrack: false };
  return { state: { ...state, started: true }, shouldTrack: true };
}

export function markMedicationAdded(state: MedicationAttemptState) {
  if (state.added) return { state, shouldTrack: false };
  return {
    state: { ...state, active: false, added: true },
    shouldTrack: true,
  };
}

export type VisitAttemptState = {
  active: boolean;
  started: boolean;
};

export function createVisitAttempt(): VisitAttemptState {
  return { active: true, started: false };
}

export function markVisitAttemptStarted(state: VisitAttemptState) {
  if (state.started) return { state, shouldTrack: false };
  return { state: { ...state, started: true }, shouldTrack: true };
}

export function markVisitAttemptCompleted(state: VisitAttemptState): VisitAttemptState {
  return { ...state, active: false };
}

export function addDeduplicationKey(keys: readonly string[], key: string, limit = 500) {
  if (keys.includes(key)) return { keys: [...keys], shouldTrack: false };
  return { keys: [...keys, key].slice(-limit), shouldTrack: true };
}
