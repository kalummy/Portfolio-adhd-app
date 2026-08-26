import type { MoodRecord } from "./types";

export const POSITIVE_MEDICATION_EFFECT_IDS = ["effective", "medication-focus-good"] as const;
export const AFTERNOON_MEDICATION_DECLINE_IDS = ["weak"] as const;
export const AFTERNOON_TIMING_LABELS = ["점심", "저녁"] as const;
export const CONCENTRATION_DIFFICULT_IDS = [
  "concentration_difficult",
  "concentration_unstable",
] as const;
export const WORK_FOCUS_EFFECT_IDS = ["work-focus-difficulty"] as const;
export const CONCENTRATION_RELATIONSHIP_IDS = ["task"] as const;
export const RELATIONSHIP_DIFFICULT_IDS = ["task", "conversation", "unfinished", "conversation-flow", "conversation-understanding", "social-withdrawal"] as const;
export const IRRITABLE_MOOD_IDS = ["irritable"] as const;
export const SLEEP_DIFFICULT_IDS = ["sleep"] as const;
export const DEADLINE_DIFFICULT_IDS = ["unfinished"] as const;
export const TASK_COMPLETION_EFFECT_IDS = ["task-completion-difficulty"] as const;

const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/u;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

export type MoodReportPatternId =
  | "afternoonMedicationDecline"
  | "concentrationDifficulty"
  | "irritability"
  | "sleepDifficulty"
  | "deadlineDifficulty";

export type MoodReportPattern = {
  id: MoodReportPatternId;
  label: string;
  count: number;
  ratio: number;
};

export type MoodMonthlyReport = {
  monthKey: string;
  totalDays: number;
  effectiveMedicationDays: number;
  relationshipDifficultyDays: number;
  patterns: MoodReportPattern[];
  clinicPhrase: string;
};

function isValidDateKey(value: string) {
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function getMoodReportMonthKey(dateKey: string) {
  return isValidDateKey(dateKey) ? dateKey.slice(0, 7) : null;
}

export function formatMoodReportMonth(monthKey: string) {
  const match = MONTH_KEY_PATTERN.exec(monthKey);
  if (!match) return "";
  return `${Number(match[1])}년 ${Number(match[2])}월 리포트`;
}

export function listMoodReportMonths(records: MoodRecord[]) {
  return [...new Set(
    records
      .map((record) => getMoodReportMonthKey(record.date))
      .filter((month): month is string => Boolean(month)),
  )].sort((left, right) => right.localeCompare(left));
}

export function filterMoodRecordsByMonth(records: MoodRecord[], monthKey: string) {
  if (!MONTH_KEY_PATTERN.test(monthKey)) return [];
  return records.filter((record) => getMoodReportMonthKey(record.date) === monthKey);
}

function includesAny(values: string[] | undefined, ids: readonly string[]) {
  return values?.some((value) => ids.includes(value)) ?? false;
}

function getDayGroups(records: MoodRecord[]) {
  const groups = new Map<string, MoodRecord[]>();
  for (const record of records) {
    if (!isValidDateKey(record.date)) continue;
    const existing = groups.get(record.date) ?? [];
    existing.push(record);
    groups.set(record.date, existing);
  }
  return [...groups.values()];
}

function countDays(
  dayGroups: MoodRecord[][],
  predicate: (record: MoodRecord) => boolean,
) {
  return dayGroups.filter((records) => records.some(predicate)).length;
}

function hasAfternoonMedicationDecline(record: MoodRecord) {
  const details = record.details;
  if (!details || !includesAny(details.medicationEffects, AFTERNOON_MEDICATION_DECLINE_IDS)) {
    return false;
  }
  return AFTERNOON_MEDICATION_DECLINE_IDS.some((effectId) => {
    const timings = details.medicationEffectTimings?.[effectId] ?? [];
    return includesAny(timings, AFTERNOON_TIMING_LABELS);
  });
}

function hasConcentrationDifficulty(record: MoodRecord) {
  const details = record.details;
  return Boolean(details && (
    includesAny(details.concentrationStates, CONCENTRATION_DIFFICULT_IDS)
    || includesAny(details.medicationEffects, WORK_FOCUS_EFFECT_IDS)
    || includesAny(details.concentrationStates, WORK_FOCUS_EFFECT_IDS)
    || includesAny(details.relationships, CONCENTRATION_RELATIONSHIP_IDS)
  ));
}

function frequencyLabel(count: number) {
  return count === 1 ? "한 차례" : `${count}일`;
}

function buildClinicPhrase({
  totalDays,
  effectiveMedicationDays,
  patterns,
}: Pick<MoodMonthlyReport, "totalDays" | "effectiveMedicationDays" | "patterns">) {
  const subjectByPattern: Record<MoodReportPatternId, string> = {
    afternoonMedicationDecline: "오후가 되면서 약 효과가 줄어드는 느낌을 기록한 날이",
    concentrationDifficulty: "집중하기 어려웠던 날이",
    irritability: "평소보다 예민하게 느껴진 날이",
    sleepDifficulty: "수면에 어려움을 느낀 날이",
    deadlineDifficulty: "할 일을 모두 끝내기 어려웠던 날이",
  };
  const selectedPatterns = patterns
    .filter((pattern) => pattern.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, 3);

  if (selectedPatterns.length === 0) {
    if (effectiveMedicationDays > 0) {
      return `이번 달에는 약 효과를 잘 느꼈다고 기록한 날이 ${frequencyLabel(effectiveMedicationDays)} 있었어요. 진료 시 이번 달의 기록을 함께 살펴보고 싶어요.`;
    }
    return `이번 달에는 총 ${totalDays}일 감정 기록을 남겼어요. 진료 시 이번 달의 기록을 함께 살펴보고 싶어요.`;
  }

  const [first, ...rest] = selectedPatterns;
  if (rest.length === 0) {
    return `이번 달에는 ${subjectByPattern[first.id]} ${frequencyLabel(first.count)} 있었습니다. 이 내용을 진료에서 상담해보고 싶어요.`;
  }

  const [second, third] = rest;
  const sentences = [
    `이번 달에는 ${subjectByPattern[first.id]} ${frequencyLabel(first.count)}, ${subjectByPattern[second.id]} ${frequencyLabel(second.count)} 있었습니다.`,
  ];
  if (third) {
    sentences.push(`${subjectByPattern[third.id]} ${frequencyLabel(third.count)} 있어, 이런 변화를 진료에서 상담해보고 싶어요.`);
  } else {
    sentences.push("이런 변화를 진료에서 상담해보고 싶어요.");
  }
  return sentences.join(" ");
}

export function buildMoodMonthlyReport(
  records: MoodRecord[],
  monthKey: string,
): MoodMonthlyReport {
  const monthRecords = filterMoodRecordsByMonth(records, monthKey);
  const dayGroups = getDayGroups(monthRecords);
  const totalDays = dayGroups.length;
  const effectiveMedicationDays = countDays(dayGroups, (record) => (
    includesAny(record.details?.medicationEffects, POSITIVE_MEDICATION_EFFECT_IDS)
  ));
  const relationshipDifficultyDays = countDays(dayGroups, (record) => (
    includesAny(record.details?.relationships, RELATIONSHIP_DIFFICULT_IDS)
  ));
  const patternDefinitions: Array<{
    id: MoodReportPatternId;
    label: string;
    predicate: (record: MoodRecord) => boolean;
  }> = [
    {
      id: "afternoonMedicationDecline",
      label: "오후 약효 저하 느낌",
      predicate: hasAfternoonMedicationDecline,
    },
    {
      id: "concentrationDifficulty",
      label: "집중력 저하",
      predicate: hasConcentrationDifficulty,
    },
    {
      id: "irritability",
      label: "예민함",
      predicate: (record) => includesAny(record.details?.moods, IRRITABLE_MOOD_IDS),
    },
    {
      id: "sleepDifficulty",
      label: "수면 문제",
      predicate: (record) => includesAny(record.details?.moods, SLEEP_DIFFICULT_IDS),
    },
    {
      id: "deadlineDifficulty",
      label: "업무 기한 맞추기 어려움",
      predicate: (record) => includesAny(record.details?.relationships, DEADLINE_DIFFICULT_IDS)
        || includesAny(record.details?.medicationEffects, TASK_COMPLETION_EFFECT_IDS)
        || includesAny(record.details?.concentrationStates, TASK_COMPLETION_EFFECT_IDS),
    },
  ];
  const patterns = patternDefinitions.map(({ id, label, predicate }) => {
    const count = countDays(dayGroups, predicate);
    return {
      id,
      label,
      count,
      ratio: totalDays === 0 ? 0 : count / totalDays,
    };
  });
  const partialReport = {
    monthKey,
    totalDays,
    effectiveMedicationDays,
    relationshipDifficultyDays,
    patterns,
  };
  return {
    ...partialReport,
    clinicPhrase: buildClinicPhrase(partialReport),
  };
}
