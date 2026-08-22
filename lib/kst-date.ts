export const KST_TIME_ZONE = "Asia/Seoul";

const KST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: KST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type DateKeyParts = {
  year: number;
  month: number;
  day: number;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function toDateKey({ year, month, day }: DateKeyParts) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseDateKey(dateKey: string): DateKeyParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;

  return { year, month, day };
}

export function isValidDateKey(dateKey: string | undefined): dateKey is string {
  return Boolean(dateKey && parseDateKey(dateKey));
}

export function getKstDateKey(date = new Date()) {
  const parts = KST_DATE_FORMATTER.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find((part) => part.type === type)?.value ?? ""
  );
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function toUtcCalendarDate(dateKey: string) {
  const parts = parseDateKey(dateKey);
  if (!parts) throw new Error(`Invalid date key: ${dateKey}`);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

export function addDaysToDateKey(dateKey: string, amount: number) {
  const date = toUtcCalendarDate(dateKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return toDateKey({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

export function startOfMonthDateKey(dateKey: string) {
  const parts = parseDateKey(dateKey);
  if (!parts) throw new Error(`Invalid date key: ${dateKey}`);
  return toDateKey({ year: parts.year, month: parts.month, day: 1 });
}

export function moveMonthDateKey(dateKey: string, amount: number) {
  const date = toUtcCalendarDate(startOfMonthDateKey(dateKey));
  date.setUTCMonth(date.getUTCMonth() + amount);
  return toDateKey({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: 1,
  });
}

export function getDateKeyDay(dateKey: string) {
  return toUtcCalendarDate(dateKey).getUTCDay();
}

export function getWeekDateKeys(dateKey: string) {
  const sunday = addDaysToDateKey(dateKey, -getDateKeyDay(dateKey));
  return Array.from({ length: 7 }, (_, index) => addDaysToDateKey(sunday, index));
}

export function getMonthCalendarDateKeys(visibleMonthKey: string) {
  const monthStart = startOfMonthDateKey(visibleMonthKey);
  const parts = parseDateKey(monthStart)!;
  const lastDay = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
  const leadingDays = getDateKeyDay(monthStart);
  const cellCount = Math.max(35, Math.ceil((leadingDays + lastDay) / 7) * 7);
  const gridStart = addDaysToDateKey(monthStart, -leadingDays);
  return Array.from({ length: cellCount }, (_, index) => addDaysToDateKey(gridStart, index));
}

export function dateKeyDayDifference(dateKey: string, referenceDateKey: string) {
  return Math.round(
    (toUtcCalendarDate(dateKey).getTime() - toUtcCalendarDate(referenceDateKey).getTime())
      / 86_400_000,
  );
}

export function formatDateKey(dateKey: string, includeYear = false) {
  const parts = parseDateKey(dateKey);
  if (!parts) return dateKey;
  return includeYear
    ? `${parts.year}년 ${parts.month}월 ${parts.day}일`
    : `${parts.month}월 ${parts.day}일`;
}
