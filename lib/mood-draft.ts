import { isCatId, type CatId } from "./cats";
import type { MoodAnalysisMetadata } from "./mood-analysis";
import {
  CUSTOM_MOOD_OPTION_ID,
  type MoodAnswerDraft,
  type StepOneKind,
} from "./mood-summary";

export type MoodDraftPhase = "questions" | "summarizing" | "result";

export type MoodSessionDraft = {
  version: 2;
  phase: MoodDraftPhase;
  step: number;
  answers: MoodAnswerDraft[];
  stepOneKind: StepOneKind;
  catId?: CatId;
  recordedAt?: string;
  analysis?: MoodAnalysisMetadata;
  analysisFailed?: boolean;
};

const PREFIX = "addi:mood-draft:";
const ANSWER_COUNT = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeAnswer(value: unknown): MoodAnswerDraft {
  if (!isRecord(value)) {
    return { selected: [], customText: "", timingsByOption: {} };
  }

  const timings = isRecord(value.timingsByOption)
    ? Object.fromEntries(Object.entries(value.timingsByOption).map(([key, raw]) => [
        key,
        Array.isArray(raw)
          ? raw.filter((item): item is string => typeof item === "string")
          : [],
      ]))
    : {};

  return {
    selected: Array.isArray(value.selected)
      ? [...new Set(value.selected.filter((item): item is string => typeof item === "string"))]
      : [],
    customText: typeof value.customText === "string" ? value.customText : "",
    timingsByOption: timings,
  };
}

function isCompleted(answer: MoodAnswerDraft) {
  return answer.selected.some((id) => id !== CUSTOM_MOOD_OPTION_ID)
    || (
      answer.selected.includes(CUSTOM_MOOD_OPTION_ID)
      && answer.customText.trim().length > 0
    );
}

function normalize(value: unknown): MoodSessionDraft | null {
  if (
    !isRecord(value)
    || (value.version !== 1 && value.version !== 2)
    || !Array.isArray(value.answers)
  ) return null;

  const rawAnswers = value.answers as unknown[];
  const answers = Array.from(
    { length: ANSWER_COUNT },
    (_, index) => normalizeAnswer(rawAnswers[index]),
  );
  const requestedPhase: MoodDraftPhase = value.phase === "summarizing" || value.phase === "result"
    ? value.phase
    : "questions";
  const hasReward = isCatId(value.catId) && typeof value.recordedAt === "string";
  const phase = requestedPhase !== "questions"
    && (!answers.every(isCompleted) || !hasReward)
    ? "questions"
    : requestedPhase;
  const step = Math.min(
    Math.max(Number.isInteger(value.step) ? Number(value.step) : 0, 0),
    ANSWER_COUNT - 1,
  );

  return {
    version: 2,
    phase,
    step,
    answers,
    stepOneKind: value.stepOneKind === "concentration"
      ? "concentration"
      : "medication_effect",
    catId: isCatId(value.catId) ? value.catId : undefined,
    recordedAt: typeof value.recordedAt === "string" ? value.recordedAt : undefined,
    analysis: isRecord(value.analysis)
      ? value.analysis as MoodAnalysisMetadata
      : undefined,
    analysisFailed: value.analysisFailed === true,
  };
}

export function getMoodDraftKey(dateKey: string) {
  return `${PREFIX}${dateKey}`;
}

export function readMoodDraft(storage: Storage, dateKey: string) {
  try {
    const raw = storage.getItem(getMoodDraftKey(dateKey));
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeMoodDraft(
  storage: Storage,
  dateKey: string,
  draft: Omit<MoodSessionDraft, "version">,
) {
  try {
    storage.setItem(getMoodDraftKey(dateKey), JSON.stringify({ version: 2, ...draft }));
  } catch {
    // Draft persistence must never block the product flow.
  }
}

export function clearMoodDraft(storage: Storage, dateKey: string) {
  try {
    storage.removeItem(getMoodDraftKey(dateKey));
  } catch {
    // Draft cleanup must never block the product flow.
  }
}
