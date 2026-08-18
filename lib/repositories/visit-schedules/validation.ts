const VISIT_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidVisitDate(visitDate: string) {
  const match = VISIT_DATE_PATTERN.exec(visitDate);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function assertValidVisitDate(visitDate: string) {
  if (!isValidVisitDate(visitDate)) {
    throw new Error("내원일은 YYYY-MM-DD 형식의 실제 날짜여야 해요.");
  }
}
