import {
  ANALYTICS_SCREEN_NAMES,
  type AnalyticsNavigationType,
  type AnalyticsScreenName,
} from "./screens";

export const ANALYTICS_EVENT_NAMES = [
  "app_opened",
  "screen_viewed",
  "login_started",
  "login_completed",
  "medication_add_started",
  "medication_added",
  "medication_taken",
  "medication_management_opened",
  "medication_schedule_edit_opened",
  "medication_schedule_updated",
  "medication_delete_confirmed",
  "mood_started",
  "mood_step_completed",
  "mood_result_viewed",
  "mood_saved",
  "visit_add_started",
  "visit_added",
  "home_date_picker_opened",
  "home_date_selected",
  "home_date_today_clicked",
  "home_date_change_confirmed",
] as const;

export const LOGIN_COMPLETED_QUERY_KEY = "analyticsLoginCompleted";

export type AnalyticsEventName = typeof ANALYTICS_EVENT_NAMES[number];
export type AnalyticsEnvironment = "development" | "production";
export type AnalyticsAuthState = "guest" | "member" | "unknown";
export type AnalyticsRoute =
  | "home"
  | "auth_login"
  | "medication_list"
  | "medication_add"
  | "mood_entry"
  | "mood_history"
  | "visit_add"
  | "visit_management"
  | "legal"
  | "other_safe";
export type MedicationAddSource = "home" | "medication_list" | "medication_management";
export type MedicationManagementSource = "medication_management";
export type AnalyticsMedicationScheduleType = "daily" | "as_needed" | "bedtime";
export type MedicationScheduleChangedFields = "schedule" | "time" | "schedule_and_time";
export type MoodSource = "home" | "mood_history";
export type MoodStep = 1 | 2 | 3 | 4;
export type DateDirection = "past" | "today" | "future";

type HomeDateSelectionProperties = {
  source: "home";
  selected_date: string;
  date_direction: DateDirection;
  days_from_today: number;
};

type EventSpecificProperties = {
  app_opened: Record<never, never>;
  screen_viewed: {
    screen_name: AnalyticsScreenName;
    previous_screen?: AnalyticsScreenName;
    navigation_type: AnalyticsNavigationType;
  };
  login_started: Record<never, never>;
  login_completed: Record<never, never>;
  medication_add_started: { source: MedicationAddSource };
  medication_added: Record<never, never>;
  medication_taken: Record<never, never>;
  medication_management_opened: { source: "home"; medication_count: number };
  medication_schedule_edit_opened: {
    source: MedicationManagementSource;
    schedule_type: AnalyticsMedicationScheduleType;
    has_scheduled_time: boolean;
  };
  medication_schedule_updated: {
    source: MedicationManagementSource;
    changed_fields: MedicationScheduleChangedFields;
    previous_schedule_type: AnalyticsMedicationScheduleType;
    new_schedule_type: AnalyticsMedicationScheduleType;
    had_scheduled_time_before: boolean;
    has_scheduled_time_after: boolean;
  };
  medication_delete_confirmed: {
    source: MedicationManagementSource;
    has_intake_history: boolean;
  };
  mood_started: { source: MoodSource };
  mood_step_completed: { step: MoodStep };
  mood_result_viewed: Record<never, never>;
  mood_saved: Record<never, never>;
  visit_add_started: Record<never, never>;
  visit_added: Record<never, never>;
  home_date_picker_opened: { source: "home"; current_date: string };
  home_date_selected: HomeDateSelectionProperties;
  home_date_today_clicked: { source: "home" };
  home_date_change_confirmed: HomeDateSelectionProperties & { previous_date: string };
};

export type AnalyticsEventProperties<T extends AnalyticsEventName> =
  EventSpecificProperties[T];

export type AnalyticsPayload = {
  environment: AnalyticsEnvironment;
  route: AnalyticsRoute;
  auth_state: AnalyticsAuthState;
  source?: MedicationAddSource | MoodSource;
  medication_count?: number;
  schedule_type?: AnalyticsMedicationScheduleType;
  has_scheduled_time?: boolean;
  changed_fields?: MedicationScheduleChangedFields;
  previous_schedule_type?: AnalyticsMedicationScheduleType;
  new_schedule_type?: AnalyticsMedicationScheduleType;
  had_scheduled_time_before?: boolean;
  has_scheduled_time_after?: boolean;
  has_intake_history?: boolean;
  step?: MoodStep;
  current_date?: string;
  previous_date?: string;
  selected_date?: string;
  date_direction?: DateDirection;
  days_from_today?: number;
  screen_name?: AnalyticsScreenName;
  previous_screen?: AnalyticsScreenName;
  navigation_type?: AnalyticsNavigationType;
};

function isScreenName(value: unknown): value is AnalyticsScreenName {
  return typeof value === "string"
    && ANALYTICS_SCREEN_NAMES.includes(value as AnalyticsScreenName);
}

function isNavigationType(value: unknown): value is AnalyticsNavigationType {
  return value === "initial" || value === "route_change";
}

export function sanitizeAnalyticsRoute(input: string): AnalyticsRoute {
  const pathname = input.split(/[?#]/u, 1)[0];

  if (pathname === "/") return "home";
  if (pathname === "/auth/login") return "auth_login";
  if (pathname === "/medications") return "medication_list";
  if (pathname === "/medications/new" || pathname.startsWith("/medications/new/")) {
    return "medication_add";
  }
  if (pathname === "/moods/new") return "mood_entry";
  if (pathname === "/moods") return "mood_history";
  if (pathname === "/visits/new") return "visit_add";
  if (pathname === "/visits" || pathname === "/visits/edit") return "visit_management";
  if (pathname === "/terms" || pathname === "/privacy") return "legal";
  return "other_safe";
}

function isMedicationAddSource(value: unknown): value is MedicationAddSource {
  return value === "home" || value === "medication_list" || value === "medication_management";
}

function isMedicationScheduleType(value: unknown): value is AnalyticsMedicationScheduleType {
  return value === "daily" || value === "as_needed" || value === "bedtime";
}

function isMedicationScheduleChangedFields(value: unknown): value is MedicationScheduleChangedFields {
  return value === "schedule" || value === "time" || value === "schedule_and_time";
}

function isMoodSource(value: unknown): value is MoodSource {
  return value === "home" || value === "mood_history";
}

function isMoodStep(value: unknown): value is MoodStep {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function isDateKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function isDateDirection(value: unknown): value is DateDirection {
  return value === "past" || value === "today" || value === "future";
}

function isDirectionConsistent(direction: DateDirection, daysFromToday: number) {
  if (daysFromToday < 0) return direction === "past";
  if (daysFromToday > 0) return direction === "future";
  return direction === "today";
}

export function buildAnalyticsPayload<T extends AnalyticsEventName>({
  authState,
  environment,
  eventName,
  pathname,
  properties,
}: {
  authState: AnalyticsAuthState;
  environment: AnalyticsEnvironment;
  eventName: T;
  pathname: string;
  properties: AnalyticsEventProperties<T>;
}): AnalyticsPayload | null {
  if (eventName === "app_opened") {
    if (authState !== "unknown") return null;
  } else if (authState === "unknown") {
    return null;
  }

  const base: AnalyticsPayload = {
    environment,
    route: sanitizeAnalyticsRoute(pathname),
    auth_state: authState,
  };

  if (eventName === "screen_viewed") {
    const {
      screen_name: screenName,
      previous_screen: previousScreen,
      navigation_type: navigationType,
    } = properties as {
      screen_name?: unknown;
      previous_screen?: unknown;
      navigation_type?: unknown;
    };
    if (!isScreenName(screenName) || !isNavigationType(navigationType)) return null;
    if (navigationType === "initial" && previousScreen !== undefined) return null;
    if (navigationType === "route_change" && !isScreenName(previousScreen)) return null;
    if (previousScreen === screenName) return null;
    const normalizedPreviousScreen = navigationType === "route_change"
      ? previousScreen as AnalyticsScreenName
      : undefined;
    return {
      ...base,
      screen_name: screenName,
      ...(normalizedPreviousScreen ? { previous_screen: normalizedPreviousScreen } : {}),
      navigation_type: navigationType,
    };
  }

  if (eventName === "medication_add_started") {
    const source = (properties as { source?: unknown }).source;
    return isMedicationAddSource(source) ? { ...base, source } : null;
  }

  if (eventName === "medication_management_opened") {
    const { source, medication_count: medicationCount } = properties as {
      source?: unknown;
      medication_count?: unknown;
    };
    return source === "home" && Number.isInteger(medicationCount) && (medicationCount as number) >= 0
      ? { ...base, source, medication_count: medicationCount as number }
      : null;
  }

  if (eventName === "medication_schedule_edit_opened") {
    const {
      source,
      schedule_type: scheduleType,
      has_scheduled_time: hasScheduledTime,
    } = properties as {
      source?: unknown;
      schedule_type?: unknown;
      has_scheduled_time?: unknown;
    };
    return source === "medication_management"
      && isMedicationScheduleType(scheduleType)
      && typeof hasScheduledTime === "boolean"
      ? {
          ...base,
          source,
          schedule_type: scheduleType,
          has_scheduled_time: hasScheduledTime,
        }
      : null;
  }

  if (eventName === "medication_schedule_updated") {
    const {
      source,
      changed_fields: changedFields,
      previous_schedule_type: previousScheduleType,
      new_schedule_type: newScheduleType,
      had_scheduled_time_before: hadScheduledTimeBefore,
      has_scheduled_time_after: hasScheduledTimeAfter,
    } = properties as {
      source?: unknown;
      changed_fields?: unknown;
      previous_schedule_type?: unknown;
      new_schedule_type?: unknown;
      had_scheduled_time_before?: unknown;
      has_scheduled_time_after?: unknown;
    };
    return source === "medication_management"
      && isMedicationScheduleChangedFields(changedFields)
      && isMedicationScheduleType(previousScheduleType)
      && isMedicationScheduleType(newScheduleType)
      && typeof hadScheduledTimeBefore === "boolean"
      && typeof hasScheduledTimeAfter === "boolean"
      ? {
          ...base,
          source,
          changed_fields: changedFields,
          previous_schedule_type: previousScheduleType,
          new_schedule_type: newScheduleType,
          had_scheduled_time_before: hadScheduledTimeBefore,
          has_scheduled_time_after: hasScheduledTimeAfter,
        }
      : null;
  }

  if (eventName === "medication_delete_confirmed") {
    const { source, has_intake_history: hasIntakeHistory } = properties as {
      source?: unknown;
      has_intake_history?: unknown;
    };
    return source === "medication_management" && typeof hasIntakeHistory === "boolean"
      ? { ...base, source, has_intake_history: hasIntakeHistory }
      : null;
  }

  if (eventName === "mood_started") {
    const source = (properties as { source?: unknown }).source;
    return isMoodSource(source) ? { ...base, source } : null;
  }

  if (eventName === "mood_step_completed") {
    const step = (properties as { step?: unknown }).step;
    return isMoodStep(step) ? { ...base, step } : null;
  }

  if (eventName === "home_date_picker_opened") {
    const { source, current_date: currentDate } = properties as {
      source?: unknown;
      current_date?: unknown;
    };
    return source === "home" && isDateKey(currentDate)
      ? { ...base, source, current_date: currentDate }
      : null;
  }

  if (eventName === "home_date_today_clicked") {
    const source = (properties as { source?: unknown }).source;
    return source === "home" ? { ...base, source } : null;
  }

  if (eventName === "home_date_selected" || eventName === "home_date_change_confirmed") {
    const {
      source,
      previous_date: previousDate,
      selected_date: selectedDate,
      date_direction: dateDirection,
      days_from_today: daysFromToday,
    } = properties as {
      source?: unknown;
      previous_date?: unknown;
      selected_date?: unknown;
      date_direction?: unknown;
      days_from_today?: unknown;
    };
    if (
      source !== "home"
      || !isDateKey(selectedDate)
      || !isDateDirection(dateDirection)
      || !Number.isInteger(daysFromToday)
      || !isDirectionConsistent(dateDirection, daysFromToday as number)
    ) return null;

    const selection: AnalyticsPayload = {
      ...base,
      source: "home",
      selected_date: selectedDate,
      date_direction: dateDirection,
      days_from_today: daysFromToday as number,
    };
    if (eventName === "home_date_selected") return selection;
    return isDateKey(previousDate)
      ? { ...selection, previous_date: previousDate }
      : null;
  }

  return base;
}
