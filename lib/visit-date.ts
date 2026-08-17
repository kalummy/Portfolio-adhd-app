const DAY_IN_MS = 86_400_000;

export function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function compareDateKeys(left: string, right: string) {
  return left.localeCompare(right);
}

export function visitDayDifference(visitDate: string, today = new Date()) {
  return Math.round(
    (fromDateKey(visitDate).getTime() - startOfLocalDay(today).getTime()) / DAY_IN_MS,
  );
}

export function formatVisitDday(visitDate: string, today = new Date()) {
  const difference = visitDayDifference(visitDate, today);
  if (difference < 0) return `D+${Math.abs(difference)}일`;
  return `D-${difference}일`;
}

export function formatVisitDate(visitDate: string) {
  const date = fromDateKey(visitDate);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}
