export const REMINDER_TIME_ZONE = "Asia/Seoul";
export const REMINDER_WINDOW_MINUTES = 30;

export const REMINDER_SLOT_KEYS = [
  "visit_day_before_0800",
  "visit_day_today_0800",
  "medication_0900",
  "daily_1100",
  "daily_1300",
  "mood_1500",
  "bedtime_2100",
] as const;

export type ReminderSlotKey = (typeof REMINDER_SLOT_KEYS)[number];
export type ReminderDeliveryKind =
  | "visit_day_before"
  | "visit_day_today"
  | "daily"
  | "as_needed"
  | "bedtime"
  | "mood";

export type ReminderWindow = {
  localDate: string;
  slotKey: ReminderSlotKey;
  windowStartedAt: string;
  windowExpiresAt: string;
};

export type ReminderContent = {
  title: string;
  body: string;
  kind: "medication" | "visit_day" | "mood";
  route: "/" | "/visits" | "/moods/new";
};

const SLOT_STARTS: ReadonlyArray<{
  slotKey: ReminderSlotKey;
  hour: number;
  minute: number;
}> = [
  { slotKey: "visit_day_before_0800", hour: 8, minute: 0 },
  { slotKey: "visit_day_today_0800", hour: 8, minute: 0 },
  { slotKey: "medication_0900", hour: 9, minute: 0 },
  { slotKey: "daily_1100", hour: 11, minute: 0 },
  { slotKey: "daily_1300", hour: 13, minute: 0 },
  { slotKey: "mood_1500", hour: 15, minute: 0 },
  { slotKey: "bedtime_2100", hour: 21, minute: 0 },
];

const CONTENT_BY_KIND: Record<ReminderDeliveryKind, ReminderContent> = {
  visit_day_before: {
    title: "내원일 알림",
    body: "내일은 병원 방문일이에요.",
    kind: "visit_day",
    route: "/visits",
  },
  visit_day_today: {
    title: "내원일 알림",
    body: "오늘은 병원 방문일이에요.",
    kind: "visit_day",
    route: "/visits",
  },
  daily: {
    title: "복용 알림",
    body: "오늘의 복용 여부를 확인해보세요.",
    kind: "medication",
    route: "/",
  },
  as_needed: {
    title: "복용 알림",
    body: "오늘 중요한 일정이 있다면 복용 계획을 확인해보세요.",
    kind: "medication",
    route: "/",
  },
  bedtime: {
    title: "복용 알림",
    body: "자기 전 평소 복용 계획을 확인해보세요.",
    kind: "medication",
    route: "/",
  },
  mood: {
    title: "감정기록 알림",
    body: "오늘의 감정은 어떠셨나요?",
    kind: "mood",
    route: "/moods/new",
  },
};

function seoulClock(instant: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REMINDER_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find((candidate) => candidate.type === type)?.value ?? ""
  );

  return {
    localDate: `${part("year")}-${part("month")}-${part("day")}`,
    hour: Number(part("hour")),
    minute: Number(part("minute")),
  };
}

function kstInstant(localDate: string, hour: number, minute: number) {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return new Date(`${localDate}T${hh}:${mm}:00+09:00`);
}

export function getActiveReminderWindows(instant: Date = new Date()): ReminderWindow[] {
  if (!Number.isFinite(instant.getTime())) return [];

  const clock = seoulClock(instant);
  const localMinute = (clock.hour * 60) + clock.minute;
  return SLOT_STARTS.filter(({ hour, minute }) => {
    const startMinute = (hour * 60) + minute;
    return localMinute >= startMinute
      && localMinute < startMinute + REMINDER_WINDOW_MINUTES;
  }).flatMap((definition) => {
    const windowStartedAt = kstInstant(clock.localDate, definition.hour, definition.minute);
    const windowExpiresAt = new Date(
      windowStartedAt.getTime() + (REMINDER_WINDOW_MINUTES * 60_000),
    );
    if (instant.getTime() < windowStartedAt.getTime()
      || instant.getTime() >= windowExpiresAt.getTime()) {
      return [];
    }

    return [{
      localDate: clock.localDate,
      slotKey: definition.slotKey,
      windowStartedAt: windowStartedAt.toISOString(),
      windowExpiresAt: windowExpiresAt.toISOString(),
    }];
  });
}

export function getActiveReminderWindow(instant: Date = new Date()): ReminderWindow | null {
  return getActiveReminderWindows(instant)[0] ?? null;
}

export function getReminderContent(kind: ReminderDeliveryKind): ReminderContent {
  return CONTENT_BY_KIND[kind];
}

export function getReminderNotificationId(localDate: string, slotKey: ReminderSlotKey) {
  return `reminder:${localDate}:${slotKey}`;
}

export function isReminderSchedulerEnabled(value: string | undefined) {
  return value === "true";
}
