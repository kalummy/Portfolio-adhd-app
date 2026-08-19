export const ANALYTICS_EVENT_NAMES = [
  "app_opened",
  "login_started",
  "login_completed",
  "medication_add_started",
  "medication_added",
  "medication_taken",
  "mood_started",
  "mood_step_completed",
  "mood_result_viewed",
  "mood_saved",
  "visit_added",
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
export type MedicationAddSource = "home" | "medication_list";
export type MoodSource = "home" | "mood_history";
export type MoodStep = 1 | 2 | 3 | 4;

type EventSpecificProperties = {
  app_opened: Record<never, never>;
  login_started: Record<never, never>;
  login_completed: Record<never, never>;
  medication_add_started: { source: MedicationAddSource };
  medication_added: Record<never, never>;
  medication_taken: Record<never, never>;
  mood_started: { source: MoodSource };
  mood_step_completed: { step: MoodStep };
  mood_result_viewed: Record<never, never>;
  mood_saved: Record<never, never>;
  visit_added: Record<never, never>;
};

export type AnalyticsEventProperties<T extends AnalyticsEventName> =
  EventSpecificProperties[T];

export type AnalyticsPayload = {
  environment: AnalyticsEnvironment;
  route: AnalyticsRoute;
  auth_state: AnalyticsAuthState;
  source?: MedicationAddSource | MoodSource;
  step?: MoodStep;
};

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
  return value === "home" || value === "medication_list";
}

function isMoodSource(value: unknown): value is MoodSource {
  return value === "home" || value === "mood_history";
}

function isMoodStep(value: unknown): value is MoodStep {
  return value === 1 || value === 2 || value === 3 || value === 4;
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

  if (eventName === "medication_add_started") {
    const source = (properties as { source?: unknown }).source;
    return isMedicationAddSource(source) ? { ...base, source } : null;
  }

  if (eventName === "mood_started") {
    const source = (properties as { source?: unknown }).source;
    return isMoodSource(source) ? { ...base, source } : null;
  }

  if (eventName === "mood_step_completed") {
    const step = (properties as { step?: unknown }).step;
    return isMoodStep(step) ? { ...base, step } : null;
  }

  return base;
}
