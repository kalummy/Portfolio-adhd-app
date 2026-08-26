import type { MoodRecord } from "./types";
import {
  addDaysToDateKey,
  getDateKeyDay,
  getKstDateKey,
  KST_TIME_ZONE,
} from "./kst-date";
import { toDateKey } from "./visit-date";

export const RECENT_MOOD_DAY_COUNT = 30;

export const MOOD_HISTORY_PERIODS = [
  { value: "1m", optionLabel: "1개월", dayCount: RECENT_MOOD_DAY_COUNT },
  { value: "3m", optionLabel: "3개월", dayCount: 90 },
  { value: "1y", optionLabel: "1년", dayCount: 365 },
] as const;

export type MoodHistoryPeriod = typeof MOOD_HISTORY_PERIODS[number]["value"];

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;
const KST_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: KST_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function getRecentMoodDateRange(todayDateKey = getKstDateKey()) {
  return getMoodHistoryDateRange("1m", todayDateKey);
}

export function getMoodHistoryDateRange(
  period: MoodHistoryPeriod,
  todayDateKey = getKstDateKey(),
) {
  const dayCount = getMoodHistoryPeriod(period).dayCount;
  return {
    startDate: addDaysToDateKey(todayDateKey, -(dayCount - 1)),
    endDate: todayDateKey,
  };
}

export function sortMoodRecordsNewestFirst(records: MoodRecord[]) {
  return [...records].sort(
    (left, right) => right.date.localeCompare(left.date)
      || right.recordedAt.localeCompare(left.recordedAt),
  );
}

export function filterRecentMoodRecords(
  records: MoodRecord[],
  todayDateKey = getKstDateKey(),
) {
  const { startDate, endDate } = getRecentMoodDateRange(todayDateKey);
  return sortMoodRecordsNewestFirst(
    records.filter((record) => record.date >= startDate && record.date <= endDate),
  );
}

export function formatMoodRecordDate(dateKey: string) {
  return `${dateKey}(${DAY_LABELS[getDateKeyDay(dateKey)]})`;
}

export function formatMoodRecordTime(recordedAt: string) {
  const date = new Date(recordedAt);
  return Number.isNaN(date.getTime()) ? "" : KST_TIME_FORMATTER.format(date);
}

export function formatMoodRecordDateTime(record: Pick<MoodRecord, "date" | "recordedAt">) {
  const time = formatMoodRecordTime(record.recordedAt);
  return time ? `${formatMoodRecordDate(record.date)} ${time}` : formatMoodRecordDate(record.date);
}

export function isMoodHistoryPeriod(value: string | undefined): value is MoodHistoryPeriod {
  return MOOD_HISTORY_PERIODS.some((period) => period.value === value);
}

export function periodStart(period: MoodHistoryPeriod, today: Date) {
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  localToday.setDate(localToday.getDate() - (getMoodHistoryPeriod(period).dayCount - 1));
  return localToday;
}

export function filterMoodRecordsByPeriod(records: MoodRecord[], period: MoodHistoryPeriod, today = new Date()) {
  const startDateKey = toDateKey(periodStart(period, today));
  const todayKey = toDateKey(today);
  return sortMoodRecordsNewestFirst(
    records.filter((record) => record.date >= startDateKey && record.date <= todayKey),
  );
}

export function getMoodHistoryPeriod(period: MoodHistoryPeriod) {
  return MOOD_HISTORY_PERIODS.find((item) => item.value === period)!;
}

function formatDate(date: Date) {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

export function getMoodHistoryRangeLabel(period: MoodHistoryPeriod, today = new Date()) {
  const start = periodStart(period, today);
  const label = getMoodHistoryPeriod(period).optionLabel;
  return `${formatDate(start)}~${formatDate(today)} (${label})`;
}

export function buildMoodHistoryStats(records: MoodRecord[]) {
  const uniqueDays = new Set(records.map((record) => record.date)).size;
  const count = (predicate: (record: MoodRecord) => boolean) => new Set(records.filter(predicate).map((record) => record.date)).size;
  const effectRecordedDays = count((record) => (record.details?.medicationEffects.length ?? 0) > 0);
  const relationshipDifficultDays = count((record) => record.details?.relationships.some((id) => id !== "none") ?? false);
  const allPatterns = [
    { label: "업무·과제 집중 어려움", count: count((record) => record.details?.medicationEffects.includes("work-focus-difficulty") || record.details?.concentrationStates?.includes("work-focus-difficulty") || false) },
    { label: "할 일 마무리 어려움", count: count((record) => record.details?.medicationEffects.includes("task-completion-difficulty") || record.details?.concentrationStates?.includes("task-completion-difficulty") || false) },
    { label: "대화 흐름 유지 어려움", count: count((record) => record.details?.relationships.includes("conversation-flow") ?? false) },
    { label: "대화 이해·따라가기 어려움", count: count((record) => record.details?.relationships.includes("conversation-understanding") ?? false) },
    { label: "혼자 있고 싶었음", count: count((record) => record.details?.relationships.includes("social-withdrawal") ?? false) },
    { label: "식욕 감소", count: count((record) => record.details?.moods.includes("appetite-decrease") ?? false) },
    { label: "식욕 변화", count: count((record) => record.details?.moods.includes("appetite") ?? false) },
    { label: "오후 약효 저하 느낌", count: count((record) => record.details?.medicationEffects.includes("weak") && Object.values(record.details.medicationEffectTimings).flat().includes("저녁") || false) },
    { label: "집중력 저하", count: count((record) => record.details?.relationships.includes("task") ?? false) },
    { label: "예민함", count: count((record) => record.details?.moods.includes("irritable") ?? false) },
    { label: "수면 문제", count: count((record) => record.details?.moods.includes("sleep") ?? false) },
    { label: "업무 기한 맞추기 어려움", count: count((record) => record.details?.relationships.includes("unfinished") ?? false) },
  ];
  const patternCount = Object.fromEntries(allPatterns.map((pattern) => [pattern.label, pattern.count]));
  const patterns = allPatterns.filter((pattern) => pattern.count >= 2);
  const repeated = (label: string) => (patternCount[label] ?? 0) >= 3 ? "반복해서 " : "";
  const clinicParts = [
    patternCount["업무·과제 집중 어려움"] >= 2
      ? `업무 또는 과제 집중이 어려웠던 날을 ${repeated("업무·과제 집중 어려움")}${patternCount["업무·과제 집중 어려움"]}일 기록했어요.` : "",
    patternCount["할 일 마무리 어려움"] >= 2
      ? `해야 할 일을 끝내기 어려웠던 날을 ${repeated("할 일 마무리 어려움")}${patternCount["할 일 마무리 어려움"]}일 기록했어요.` : "",
    patternCount["대화 흐름 유지 어려움"] >= 2
      ? `대화 중 다른 생각이 들어 흐름을 놓친 날을 ${repeated("대화 흐름 유지 어려움")}${patternCount["대화 흐름 유지 어려움"]}일 기록했어요.` : "",
    patternCount["대화 이해·따라가기 어려움"] >= 2
      ? `상대방의 말을 이해하고 따라가기 어려웠던 날을 ${repeated("대화 이해·따라가기 어려움")}${patternCount["대화 이해·따라가기 어려움"]}일 기록했어요.` : "",
    patternCount["식욕 감소"] >= 2
      ? `식욕 감소를 ${repeated("식욕 감소")}${patternCount["식욕 감소"]}일 기록했어요.` : "",
    patternCount["오후 약효 저하 느낌"] >= 2
      ? `오후에 약 효과가 줄어든 느낌을 ${repeated("오후 약효 저하 느낌")}${patternCount["오후 약효 저하 느낌"]}일 기록했어요.` : "",
    patternCount["예민함"] >= 2
      ? `예민함을 ${repeated("예민함")}${patternCount["예민함"]}일 기록했어요.` : "",
    patternCount["수면 문제"] >= 2
      ? `수면 문제를 ${repeated("수면 문제")}${patternCount["수면 문제"]}일 기록했어요.` : "",
    patternCount["집중력 저하"] >= 2
      ? `업무 또는 과제 집중이 어려웠던 날을 ${repeated("집중력 저하")}${patternCount["집중력 저하"]}일 기록했어요.` : "",
  ].filter(Boolean);
  const clinicPhrase = clinicParts.join(" ") || "기록을 더 모으면 진료에서 말하기 쉬운 요약을 보여드려요.";
  return { uniqueDays, effectRecordedDays, relationshipDifficultDays, patterns, clinicPhrase };
}
