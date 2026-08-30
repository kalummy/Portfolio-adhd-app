import {
  PUSH_PREFERENCE_KINDS,
  type PushPreferenceKind,
  type PushPreferences,
} from "./contracts";

const PUSH_PREFERENCES_CACHE_KEY = "addi:push-preferences:v1";
let cachedPushPreferences: PushPreferences | null = null;

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

export function getCachedPushPreferences(): PushPreferences | null {
  if (typeof window === "undefined") return null;
  if (cachedPushPreferences) return { ...cachedPushPreferences };

  try {
    const stored = window.sessionStorage.getItem(PUSH_PREFERENCES_CACHE_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!isPushPreferences(parsed)) {
      window.sessionStorage.removeItem(PUSH_PREFERENCES_CACHE_KEY);
      return null;
    }
    cachedPushPreferences = parsed;
    return { ...parsed };
  } catch {
    return null;
  }
}

export function cachePushPreferences(preferences: PushPreferences) {
  if (typeof window === "undefined") return;
  cachedPushPreferences = { ...preferences };
  try {
    window.sessionStorage.setItem(PUSH_PREFERENCES_CACHE_KEY, JSON.stringify(preferences));
  } catch {
    // The in-memory cache still prevents a false flash when sessionStorage is unavailable.
  }
}

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
