import { normalizeClinicPhraseForDisplay } from "./clinic-phrase";
import type { MoodRecord } from "./types";

export const POSITIVE_FOCUS_IDS = [
  "effective",
  "concentration_good",
  "medication-focus-good",
] as const;
export const FOCUS_DECLINE_IDS = [
  "weak",
  "concentration_difficult",
  "concentration_unstable",
  "work-focus-difficulty",
  "task-completion-difficulty",
] as const;
export const CONCENTRATION_DIFFICULT_IDS = [
  "concentration_difficult",
  "concentration_unstable",
  "work-focus-difficulty",
  "task-completion-difficulty",
] as const;
export const CONCENTRATION_RELATIONSHIP_IDS = ["task"] as const;
export const RELATIONSHIP_DIFFICULT_IDS = ["task", "conversation", "unfinished", "conversation-flow", "conversation-understanding", "social-withdrawal"] as const;
export const IRRITABLE_MOOD_IDS = ["irritable"] as const;
export const DEPRESSED_MOOD_IDS = ["depressed"] as const;
export const LETHARGIC_MOOD_IDS = ["lethargic"] as const;

const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/u;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

export type MoodReportPatternId =
  | "medicationDecline"
  | "concentrationDifficulty"
  | "irritability"
  | "depression"
  | "lethargy";

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

function getEvidenceBackedText(record: MoodRecord, evidenceId: "step1:custom" | "step3:custom") {
  const result = record.analysisResult;
  const analysisText = result
    ? [...result.todayEmotion, result.clinicPhrase]
      .filter((item) => item.evidenceIds.includes(evidenceId))
      .map((item) => item.text)
    : [];
  const customText = evidenceId === "step1:custom"
    ? record.details?.customText.medicationEffect
    : record.details?.customText.relationship;
  return normalizeClinicPhraseForDisplay([customText, ...analysisText].filter(Boolean).join(" "));
}

function hasFocusDifficultyMeaning(value: string) {
  if (!value) return false;
  return /(?:집중(?:이|을|하기|하려|도)?[^.!?]{0,18}(?:안|못|어려|어렵|힘들|흐트러|떨어|저하|실패)|산만|해야\s*할\s*일[^.!?]{0,18}(?:끝내|마치)[^.!?]{0,8}(?:못|어려|어렵)|약\s*효(?:과)?[^.!?]{0,14}(?:줄|떨어|약하)|효과가[^.!?]{0,10}(?:약했|떨어))/u.test(value);
}

function hasPositiveFocusMeaning(value: string) {
  if (!value || hasFocusDifficultyMeaning(value)) return false;
  return /(?:집중(?:이|을|하기)?[^.!?]{0,14}(?:잘\s*(?:됐|되었|됨)|수\s*있었|쉬웠|수월)|(?:업무|과제)[^.!?]{0,16}집중[^.!?]{0,12}(?:잘\s*(?:됐|되었)|수\s*있었|쉬웠|수월))/u.test(value);
}

function hasRelationshipNoProblemMeaning(value: string) {
  if (!value) return false;
  return /(?:사람들과[^.!?]{0,12}잘\s*지냈|대화[^.!?]{0,16}(?:문제|어려)[^.!?]{0,10}(?:없|않)|관계[^.!?]{0,16}(?:문제|어려)[^.!?]{0,10}(?:없|않)|특별한[^.!?]{0,12}(?:문제|어려)[^.!?]{0,10}(?:없|않))/u.test(value);
}

function hasRelationshipDifficultyMeaning(value: string) {
  if (!value || hasRelationshipNoProblemMeaning(value)) return false;
  return /(?:대화[^.!?]{0,18}(?:흐름[^.!?]{0,8}놓|집중[^.!?]{0,8}(?:안|못|어려|어렵)|이해[^.!?]{0,8}(?:어려|어렵)|어려|어렵|힘들)|이야기[^.!?]{0,14}이해[^.!?]{0,8}(?:어려|어렵)|사람들과[^.!?]{0,14}(?:부담|어려|어렵|힘들)|혼자[^.!?]{0,8}있고\s*싶|관계[^.!?]{0,14}(?:어려|어렵|힘들|문제))/u.test(value);
}

function hasPositiveFocus(record: MoodRecord) {
  const details = record.details;
  if (!details) return false;
  const hasExplicitDecline = includesAny(details.medicationEffects, FOCUS_DECLINE_IDS)
    || includesAny(details.concentrationStates, FOCUS_DECLINE_IDS);
  if (hasExplicitDecline) return false;
  return includesAny(details.medicationEffects, POSITIVE_FOCUS_IDS)
    || includesAny(details.concentrationStates, POSITIVE_FOCUS_IDS)
    || hasPositiveFocusMeaning(getEvidenceBackedText(record, "step1:custom"));
}

function hasMedicationDecline(record: MoodRecord) {
  const details = record.details;
  return Boolean(details && (
    includesAny(details.medicationEffects, FOCUS_DECLINE_IDS)
    || includesAny(details.concentrationStates, FOCUS_DECLINE_IDS)
    || hasFocusDifficultyMeaning(getEvidenceBackedText(record, "step1:custom"))
  ));
}

function hasConcentrationDifficulty(record: MoodRecord) {
  const details = record.details;
  return Boolean(details && (
    includesAny(details.concentrationStates, CONCENTRATION_DIFFICULT_IDS)
    || includesAny(details.medicationEffects, CONCENTRATION_DIFFICULT_IDS)
    || includesAny(details.relationships, CONCENTRATION_RELATIONSHIP_IDS)
    || hasFocusDifficultyMeaning(getEvidenceBackedText(record, "step1:custom"))
  ));
}

function hasRelationshipDifficulty(record: MoodRecord) {
  const details = record.details;
  if (!details) return false;
  const directInput = getEvidenceBackedText(record, "step3:custom");
  if (hasRelationshipNoProblemMeaning(directInput)) return false;
  return includesAny(details.relationships, RELATIONSHIP_DIFFICULT_IDS)
    || hasRelationshipDifficultyMeaning(directInput);
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
    medicationDecline: "약효가 줄어드는 느낌을",
    concentrationDifficulty: "집중하기 어려움을",
    irritability: "예민함을",
    depression: "우울함을",
    lethargy: "무기력함을",
  };
  const selectedPatterns = patterns
    .filter((pattern) => pattern.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, 3);

  if (selectedPatterns.length === 0) {
    if (effectiveMedicationDays > 0) {
      return `저는 이번 달 집중이 잘 된 날을 ${frequencyLabel(effectiveMedicationDays)} 기록했어요. 진료에서 이번 달 기록을 함께 이야기해보고 싶어요.`;
    }
    return `저는 이번 달 총 ${totalDays}일 감정 기록을 남겼어요. 진료에서 이번 달 기록을 함께 이야기해보고 싶어요.`;
  }
  const observations = selectedPatterns
    .map((pattern) => `${subjectByPattern[pattern.id]} ${frequencyLabel(pattern.count)}`)
    .join(", ");
  return `저는 이번 달 ${observations} 기록했어요. 진료에서 이 변화를 함께 이야기해보고 싶어요.`;
}

export function buildMoodMonthlyReport(
  records: MoodRecord[],
  monthKey: string,
): MoodMonthlyReport {
  const monthRecords = filterMoodRecordsByMonth(records, monthKey);
  const dayGroups = getDayGroups(monthRecords);
  const totalDays = dayGroups.length;
  const effectiveMedicationDays = countDays(dayGroups, (record) => (
    hasPositiveFocus(record)
  ));
  const relationshipDifficultyDays = countDays(dayGroups, (record) => (
    hasRelationshipDifficulty(record)
  ));
  const patternDefinitions: Array<{
    id: MoodReportPatternId;
    label: string;
    predicate: (record: MoodRecord) => boolean;
  }> = [
    {
      id: "medicationDecline",
      label: "약효 저하 느낌",
      predicate: hasMedicationDecline,
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
      id: "depression",
      label: "우울함",
      predicate: (record) => includesAny(record.details?.moods, DEPRESSED_MOOD_IDS),
    },
    {
      id: "lethargy",
      label: "무기력함",
      predicate: (record) => includesAny(record.details?.moods, LETHARGIC_MOOD_IDS),
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
