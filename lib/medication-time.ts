export type MedicationTimePeriod = "am" | "pm";

export type MedicationTimeFields = {
  period: MedicationTimePeriod;
  hour: string;
  minute: string;
};

export type MedicationEditorTimeIntake = {
  id: string;
  medicationId: string;
  date: string;
  taken: boolean;
  recordedAt: string;
};

export type MedicationEditorTimeContext = {
  targetDateKey: string;
  timeZone: string;
  isValidDateKey: (dateKey: string) => boolean;
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

export function resolveMedicationEditorInitialTime(
  medicationId: string,
  intakeRecords: MedicationEditorTimeIntake[],
  context: MedicationEditorTimeContext,
): MedicationTimeFields | null {
  if (!context.isValidDateKey(context.targetDateKey)) return null;
  const matchingIntakes = intakeRecords
    .filter((record) => (
      record.medicationId === medicationId
      && record.taken === true
      && context.isValidDateKey(record.date)
      && record.date === context.targetDateKey
      && !Number.isNaN(new Date(record.recordedAt).getTime())
    ));
  if (matchingIntakes.length !== 1) return null;

  const recordedDate = new Date(matchingIntakes[0].recordedAt);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: context.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(recordedDate);
  const value = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find((part) => part.type === type)?.value ?? ""
  );
  return parseScheduledTime(`${value("hour")}:${value("minute")}`);
}

export function toRecordedAtIso(
  dateKey: string,
  fields: MedicationTimeFields,
): string | undefined {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  const time = toScheduledTime(fields);
  if (!dateMatch || time == null) return undefined;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const [hour, minute] = time.split(":").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour - 9, minute, 0, 0));
  const kstParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(utcDate);
  const value = (type: Intl.DateTimeFormatPartTypes) => (
    kstParts.find((part) => part.type === type)?.value ?? ""
  );
  const roundTripDateKey = `${value("year")}-${value("month")}-${value("day")}`;
  if (
    roundTripDateKey !== dateKey
    || value("hour") !== String(hour).padStart(2, "0")
    || value("minute") !== String(minute).padStart(2, "0")
  ) return undefined;

  return utcDate.toISOString();
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
