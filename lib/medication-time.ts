export type MedicationTimePeriod = "am" | "pm";

export type MedicationTimeFields = {
  period: MedicationTimePeriod;
  hour: string;
  minute: string;
};

const CANONICAL_TIME_PATTERN = /^(\d{2}):(\d{2})$/;

export function digitsOnly(value: string, maxLength = 2) {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

export function parseScheduledTime(value?: string | null): MedicationTimeFields | null {
  if (!value) return null;
  const match = CANONICAL_TIME_PATTERN.exec(value);
  if (!match) return null;

  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  if (hour24 > 23 || minute > 59) return null;

  return {
    period: hour24 >= 12 ? "pm" : "am",
    hour: String(hour24 % 12 || 12),
    minute: match[2],
  };
}

export function formatScheduledTimeLabel(value?: string | null) {
  const parsed = parseScheduledTime(value);
  if (!parsed) return null;
  return `${parsed.period === "am" ? "오전" : "오후"} ${parsed.hour}:${parsed.minute}`;
}

export function normalizeHourInput(
  value: string,
  currentPeriod: MedicationTimePeriod,
): Pick<MedicationTimeFields, "period" | "hour"> {
  const digits = digitsOnly(value);
  if (!digits) return { period: currentPeriod, hour: "" };
  if (digits === "0") return { period: "am", hour: "0" };

  const hour = Number(digits);
  if (hour > 23) return { period: currentPeriod, hour: digits };
  if (hour === 0) return { period: "am", hour: "12" };
  if (hour >= 13) return { period: "pm", hour: String(hour - 12) };
  if (hour === 12) return { period: "pm", hour: "12" };
  if (digits.startsWith("0")) return { period: "am", hour: String(hour) };
  return { period: currentPeriod, hour: String(hour) };
}

export function toScheduledTime({
  period,
  hour,
  minute,
}: MedicationTimeFields): string | null | undefined {
  if (!hour && !minute) return null;
  if (!hour || !minute || !/^\d{1,2}$/.test(hour) || !/^\d{1,2}$/.test(minute)) {
    return undefined;
  }

  const hour12 = Number(hour);
  const minuteNumber = Number(minute);
  if (hour12 < 1 || hour12 > 12 || minuteNumber > 59) return undefined;

  const hour24 = period === "am"
    ? hour12 % 12
    : (hour12 % 12) + 12;
  return `${String(hour24).padStart(2, "0")}:${String(minuteNumber).padStart(2, "0")}`;
}
