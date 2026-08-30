import type { PushPreferenceKind, PushPreferences } from "./contracts";

export const DISABLED_PUSH_PREFERENCES: PushPreferences = {
  medication: false,
  visit_day: false,
  mood: false,
};

export function setPushPreference(
  preferences: PushPreferences,
  kind: PushPreferenceKind,
  enabled: boolean,
): PushPreferences {
  return { ...preferences, [kind]: enabled };
}

export function rollbackPushPreference(
  preferences: PushPreferences,
  kind: PushPreferenceKind,
  attemptedValue: boolean,
  previousValue: boolean,
): PushPreferences {
  if (preferences[kind] !== attemptedValue) return preferences;
  return setPushPreference(preferences, kind, previousValue);
}
