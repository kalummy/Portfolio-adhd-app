import {
  PUSH_PREFERENCE_KINDS,
  type PushPreferenceKind,
} from "./contracts";

type PreferenceMutationRequest = {
  requestId?: string;
  sequence: number;
};

type PreferenceMutationOptions = {
  persist: (
    kind: PushPreferenceKind,
    enabled: boolean,
    request: PreferenceMutationRequest,
  ) => Promise<void>;
  onPendingChange?: (kind: PushPreferenceKind, pending: boolean) => void;
  onConfirmed?: (kind: PushPreferenceKind, enabled: boolean) => void;
  onFailed?: (
    kind: PushPreferenceKind,
    attemptedValue: boolean,
    error: unknown,
  ) => void;
  createRequestId?: (kind: PushPreferenceKind, sequence: number) => string | undefined;
};

type PreferenceMutationState = {
  desiredValue: boolean | null;
  requestSequence: number;
  run: Promise<void> | null;
};

function createInitialState(): Record<PushPreferenceKind, PreferenceMutationState> {
  return Object.fromEntries(PUSH_PREFERENCE_KINDS.map((kind) => [kind, {
    desiredValue: null,
    requestSequence: 0,
    run: null,
  }])) as Record<PushPreferenceKind, PreferenceMutationState>;
}

export function isPushPreferenceRequestInstrumentationEnabled() {
  return process.env.NODE_ENV === "development"
    || process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";
}

export function createPushPreferenceMutationQueue(options: PreferenceMutationOptions) {
  const states = createInitialState();

  async function persistLatest(kind: PushPreferenceKind): Promise<void> {
    const state = states[kind];
    const enabled = state.desiredValue;
    if (enabled === null) return;

    const sequence = ++state.requestSequence;
    const requestId = options.createRequestId?.(kind, sequence);

    try {
      await options.persist(kind, enabled, { requestId, sequence });
      options.onConfirmed?.(kind, enabled);
    } catch (error) {
      if (state.desiredValue === enabled) {
        state.desiredValue = null;
        options.onFailed?.(kind, enabled, error);
        return;
      }
    }

    if (state.desiredValue !== enabled) {
      await persistLatest(kind);
      return;
    }

    state.desiredValue = null;
  }

  function enqueue(kind: PushPreferenceKind, enabled: boolean) {
    const state = states[kind];
    state.desiredValue = enabled;
    if (state.run) return state.run;

    options.onPendingChange?.(kind, true);
    const run = (async () => {
      try {
        await persistLatest(kind);
      } finally {
        state.run = null;
        options.onPendingChange?.(kind, false);
      }
    })();
    state.run = run;
    return run;
  }

  function whenIdle(kind: PushPreferenceKind) {
    return states[kind].run ?? Promise.resolve();
  }

  return { enqueue, whenIdle };
}
