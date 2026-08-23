import { CUSTOM_MOOD_OPTION_ID, type MoodAnswerDraft } from "./mood-summary";

export type MoodDraftPhase = "questions" | "summarizing" | "result";

export type MoodSessionDraft = {
  version: 1;
  phase: MoodDraftPhase;
  step: number;
  answers: MoodAnswerDraft[];
};

const MOOD_DRAFT_VERSION = 1;
const MOOD_DRAFT_PREFIX = "addi:mood-draft:";
const MOOD_QUESTION_COUNT = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTimings(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([optionId, timings]) => {
    if (!Array.isArray(timings)) return [];
    return [[optionId, [...new Set(timings.filter((timing): timing is string => typeof timing === "string"))]]];
  }));
}

function normalizeAnswer(value: unknown): MoodAnswerDraft {
  if (!isRecord(value)) return { selected: [], customText: "", timingsByOption: {} };
  const selected = Array.isArray(value.selected)
    ? [...new Set(value.selected.filter((optionId): optionId is string => typeof optionId === "string"))]
    : [];
  return {
    selected,
    customText: typeof value.customText === "string" ? value.customText : "",
    timingsByOption: normalizeTimings(value.timingsByOption),
  };
}

function hasCompletedAnswer(answer: MoodAnswerDraft) {
  return answer.selected.some((optionId) => optionId !== CUSTOM_MOOD_OPTION_ID)
    || (answer.selected.includes(CUSTOM_MOOD_OPTION_ID) && answer.customText.trim().length > 0);
}

function normalizeDraft(value: unknown): MoodSessionDraft | null {
  if (!isRecord(value) || value.version !== MOOD_DRAFT_VERSION || !Array.isArray(value.answers)) return null;
  const rawAnswers = value.answers;
  const answers = Array.from({ length: MOOD_QUESTION_COUNT }, (_, index) => normalizeAnswer(rawAnswers[index]));
  const requestedStep = typeof value.step === "number" && Number.isInteger(value.step) ? value.step : 0;
  const step = Math.min(Math.max(requestedStep, 0), MOOD_QUESTION_COUNT - 1);
  const requestedPhase = value.phase === "summarizing" || value.phase === "result" ? value.phase : "questions";
  const phase = requestedPhase !== "questions" && !answers.every(hasCompletedAnswer) ? "questions" : requestedPhase;
  const safeStep = phase === "questions" && requestedPhase !== "questions"
    ? Math.max(answers.findIndex((answer) => !hasCompletedAnswer(answer)), 0)
    : step;
  return { version: MOOD_DRAFT_VERSION, phase, step: safeStep, answers };
}

export function getMoodDraftKey(dateKey: string) {
  return `${MOOD_DRAFT_PREFIX}${dateKey}`;
}

export function readMoodDraft(storage: Storage, dateKey: string) {
  try {
    const raw = storage.getItem(getMoodDraftKey(dateKey));
    return raw ? normalizeDraft(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeMoodDraft(storage: Storage, dateKey: string, draft: Omit<MoodSessionDraft, "version">) {
  try {
    storage.setItem(getMoodDraftKey(dateKey), JSON.stringify({ version: MOOD_DRAFT_VERSION, ...draft }));
  } catch {
    // sessionStorage can be unavailable in private or restricted browser contexts.
  }
}

export function clearMoodDraft(storage: Storage, dateKey: string) {
  try {
    storage.removeItem(getMoodDraftKey(dateKey));
  } catch {
    // A blocked sessionStorage must not break save, restart, or exit navigation.
  }
}
