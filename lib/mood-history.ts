import type { MoodRecord } from "./types";
import { toDateKey } from "./visit-date";

export const MOOD_HISTORY_PERIODS = [
  { value: "1w", optionLabel: "1주일", selectLabel: "최근 1주일 기록내역" },
  { value: "1m", optionLabel: "1개월", selectLabel: "최근 1 개월 기록내역" },
  { value: "3m", optionLabel: "3개월", selectLabel: "최근 3개월 기록내역" },
  { value: "6m", optionLabel: "6개월", selectLabel: "최근 6개월 기록내역" },
  { value: "1y", optionLabel: "1년", selectLabel: "최근 1년 기록내역" },
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

function periodStart(period: MoodHistoryPeriod, today: Date) {
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (period === "1w") {
    localToday.setDate(localToday.getDate() - 6);
    return localToday;
  }

  const months = period === "1m" ? 1 : period === "3m" ? 3 : period === "6m" ? 6 : 12;
  return subtractCalendarMonths(localToday, months);
}

export function filterMoodRecordsByPeriod(
  records: MoodRecord[],
  period: MoodHistoryPeriod,
  today = new Date(),
) {
  const startDateKey = toDateKey(periodStart(period, today));
  const todayKey = toDateKey(today);

  return records
    .filter((record) => record.date >= startDateKey && record.date <= todayKey)
    .sort((left, right) => (
      right.recordedAt.localeCompare(left.recordedAt) || right.date.localeCompare(left.date)
    ));
}

export function getMoodHistoryPeriod(period: MoodHistoryPeriod) {
  return MOOD_HISTORY_PERIODS.find((item) => item.value === period)!;
}
