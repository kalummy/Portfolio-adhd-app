import {
  PUSH_PREFERENCE_KINDS,
  type PushPreferenceKind,
  type PushPreferences,
} from "../../../../lib/push/contracts";

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

export type PushPreferenceVersions = Record<PushPreferenceKind, number>;

export const INITIAL_PUSH_PREFERENCE_VERSIONS: PushPreferenceVersions = {
  medication: 0,
  visit_day: 0,
  mood: 0,
};

export function isPushPreferences(value: unknown): value is PushPreferences {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PushPreferences>;
  return PUSH_PREFERENCE_KINDS.every((kind) => typeof candidate[kind] === "boolean");
}

// Native preferences come from the installation registration; no shared Web cache.
export function getCachedPushPreferences(): PushPreferences | null { return null; }
export function cachePushPreferences(_preferences: PushPreferences) {}

export function mergePushPreferenceSnapshot(
  current: PushPreferences | null,
  snapshot: PushPreferences,
  requestVersions: PushPreferenceVersions,
  currentVersions: PushPreferenceVersions,
): PushPreferences {
  const merged = current ? { ...current } : { ...snapshot };
  for (const kind of PUSH_PREFERENCE_KINDS) {
    if (requestVersions[kind] === currentVersions[kind]) {
      merged[kind] = snapshot[kind];
    }
  }
  return merged;
}
