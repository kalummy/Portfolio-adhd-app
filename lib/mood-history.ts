import type { MoodRecord } from "./types";
import { toDateKey } from "./visit-date";

export const MOOD_HISTORY_PERIODS = [
  { value: "14d", optionLabel: "14일", summaryLabel: "2주" },
  { value: "1m", optionLabel: "1개월", summaryLabel: "1개월" },
  { value: "3m", optionLabel: "3개월", summaryLabel: "3개월" },
] as const;

export type MoodHistoryPeriod = typeof MOOD_HISTORY_PERIODS[number]["value"];

export function isMoodHistoryPeriod(value: string | undefined): value is MoodHistoryPeriod {
  return MOOD_HISTORY_PERIODS.some((period) => period.value === value);
}

function subtractCalendarMonths(date: Date, months: number) {
  const target = new Date(date.getFullYear(), date.getMonth() - months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

export function periodStart(period: MoodHistoryPeriod, today: Date) {
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (period === "14d") { localToday.setDate(localToday.getDate() - 13); return localToday; }
  return subtractCalendarMonths(localToday, period === "1m" ? 1 : 3);
}

export function filterMoodRecordsByPeriod(records: MoodRecord[], period: MoodHistoryPeriod, today = new Date()) {
  const startDateKey = toDateKey(periodStart(period, today));
  const todayKey = toDateKey(today);
  return records
    .filter((record) => record.date >= startDateKey && record.date <= todayKey)
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt) || right.date.localeCompare(left.date));
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
