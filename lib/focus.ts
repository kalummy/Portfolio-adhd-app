import { createClientId } from "./client-id";

export const FOCUS_TIMER_STORAGE_KEY = "addi:focus-timer:v1";
export const FOCUS_TODOS_STORAGE_KEY = "addi:focus-todos:v1";

export const FOCUS_MODES = ["focus", "shortBreak", "longBreak"] as const;
export type FocusMode = (typeof FOCUS_MODES)[number];
export type FocusTimerStatus = "idle" | "running" | "paused";

export const FOCUS_DURATIONS_MS: Record<FocusMode, number> = {
  focus: 25 * 60 * 1000,
  shortBreak: 5 * 60 * 1000,
  longBreak: 15 * 60 * 1000,
};

export const FOCUS_MODE_LABELS: Record<FocusMode, string> = {
  focus: "집중",
  shortBreak: "휴식",
  longBreak: "긴 휴식",
};

export const FOCUS_SESSIONS_PER_SET = 4;

export type FocusTimerState = {
  mode: FocusMode;
  status: FocusTimerStatus;
  remainingMs: number;
  endsAt: number | null;
  completedInSet: number;
};

export type FocusTodo = {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
};

export function createDefaultFocusTimer(): FocusTimerState {
  return {
    mode: "focus",
    status: "idle",
    remainingMs: FOCUS_DURATIONS_MS.focus,
    endsAt: null,
    completedInSet: 0,
  };
}

export function formatFocusDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function focusProgress(state: FocusTimerState) {
  const total = FOCUS_DURATIONS_MS[state.mode];
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - state.remainingMs / total));
}

export function syncRunningTimer(state: FocusTimerState, now = Date.now()): FocusTimerState {
  if (state.status !== "running" || state.endsAt == null) return state;
  return {
    ...state,
    remainingMs: Math.max(0, state.endsAt - now),
  };
}

export function startFocusTimer(state: FocusTimerState, now = Date.now()): FocusTimerState {
  const remainingMs = state.remainingMs > 0 ? state.remainingMs : FOCUS_DURATIONS_MS[state.mode];
  return {
    ...state,
    status: "running",
    remainingMs,
    endsAt: now + remainingMs,
  };
}

export function pauseFocusTimer(state: FocusTimerState, now = Date.now()): FocusTimerState {
  const remainingMs = state.endsAt == null ? state.remainingMs : Math.max(0, state.endsAt - now);
  return {
    ...state,
    status: remainingMs > 0 ? "paused" : "idle",
    remainingMs,
    endsAt: null,
  };
}

export function resetFocusTimer(state: FocusTimerState): FocusTimerState {
  return {
    ...state,
    status: "idle",
    remainingMs: FOCUS_DURATIONS_MS[state.mode],
    endsAt: null,
  };
}

export function switchFocusMode(state: FocusTimerState, mode: FocusMode): FocusTimerState {
  if (state.mode === mode && state.status === "idle") return state;
  return {
    ...state,
    mode,
    status: "idle",
    remainingMs: FOCUS_DURATIONS_MS[mode],
    endsAt: null,
  };
}

export function completeFocusTimer(state: FocusTimerState): {
  state: FocusTimerState;
  toast: string;
} {
  if (state.mode === "focus") {
    const completedInSet = Math.min(FOCUS_SESSIONS_PER_SET, state.completedInSet + 1);
    const nextMode: FocusMode = completedInSet >= FOCUS_SESSIONS_PER_SET ? "longBreak" : "shortBreak";
    return {
      state: {
        mode: nextMode,
        status: "idle",
        remainingMs: FOCUS_DURATIONS_MS[nextMode],
        endsAt: null,
        completedInSet,
      },
      toast: nextMode === "longBreak" ? "집중 4회 완료! 길게 쉬어가요" : "집중 끝! 잠깐 쉬어가요",
    };
  }

  const resetSet = state.mode === "longBreak";
  return {
    state: {
      mode: "focus",
      status: "idle",
      remainingMs: FOCUS_DURATIONS_MS.focus,
      endsAt: null,
      completedInSet: resetSet ? 0 : state.completedInSet,
    },
    toast: resetSet ? "긴 휴식 끝! 새로운 세트를 시작해요" : "휴식 끝! 다시 집중해볼까요",
  };
}

function isFocusMode(value: unknown): value is FocusMode {
  return value === "focus" || value === "shortBreak" || value === "longBreak";
}

function isTimerStatus(value: unknown): value is FocusTimerStatus {
  return value === "idle" || value === "running" || value === "paused";
}

export function parseFocusTimerState(input: unknown): FocusTimerState | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  if (!isFocusMode(value.mode) || !isTimerStatus(value.status)) return null;
  if (typeof value.remainingMs !== "number" || !Number.isFinite(value.remainingMs) || value.remainingMs < 0) {
    return null;
  }
  if (value.endsAt !== null && (typeof value.endsAt !== "number" || !Number.isFinite(value.endsAt))) {
    return null;
  }
  if (
    typeof value.completedInSet !== "number"
    || !Number.isInteger(value.completedInSet)
    || value.completedInSet < 0
    || value.completedInSet > FOCUS_SESSIONS_PER_SET
  ) {
    return null;
  }

  const parsed: FocusTimerState = {
    mode: value.mode,
    status: value.status,
    remainingMs: Math.min(value.remainingMs, FOCUS_DURATIONS_MS[value.mode]),
    endsAt: value.endsAt,
    completedInSet: value.completedInSet,
  };
  return parsed.status === "running" ? syncRunningTimer(parsed) : parsed;
}

export function parseFocusTodos(input: unknown): FocusTodo[] | null {
  if (!Array.isArray(input)) return null;
  const todos: FocusTodo[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") return null;
    const value = item as Record<string, unknown>;
    if (typeof value.id !== "string" || typeof value.text !== "string") return null;
    if (typeof value.done !== "boolean" || typeof value.createdAt !== "string") return null;
    const text = value.text.trim();
    if (!text) continue;
    todos.push({
      id: value.id,
      text,
      done: value.done,
      createdAt: value.createdAt,
    });
  }
  return todos;
}

export function createFocusTodo(text: string): FocusTodo | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return {
    id: createClientId(),
    text: trimmed,
    done: false,
    createdAt: new Date().toISOString(),
  };
}

export function sortFocusTodos(todos: FocusTodo[]) {
  return [...todos].sort((left, right) => {
    if (left.done !== right.done) return left.done ? 1 : -1;
    return left.createdAt.localeCompare(right.createdAt);
  });
}

export function readFocusTimer(): FocusTimerState {
  try {
    const raw = window.localStorage.getItem(FOCUS_TIMER_STORAGE_KEY);
    if (!raw) return createDefaultFocusTimer();
    return parseFocusTimerState(JSON.parse(raw)) ?? createDefaultFocusTimer();
  } catch {
    return createDefaultFocusTimer();
  }
}

export function writeFocusTimer(state: FocusTimerState) {
  try {
    window.localStorage.setItem(FOCUS_TIMER_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Local focus state must never block the product flow.
  }
}

export function readFocusTodos(): FocusTodo[] {
  try {
    const raw = window.localStorage.getItem(FOCUS_TODOS_STORAGE_KEY);
    if (!raw) return [];
    return parseFocusTodos(JSON.parse(raw)) ?? [];
  } catch {
    return [];
  }
}

export function writeFocusTodos(todos: FocusTodo[]) {
  try {
    window.localStorage.setItem(FOCUS_TODOS_STORAGE_KEY, JSON.stringify(todos));
  } catch {
    // Local focus state must never block the product flow.
  }
}
