export const ANALYTICS_SCREEN_NAMES = [
  "home",
  "account",
  "medication_management",
  "medication_schedule_edit",
  "medication_registration",
  "mood_create",
  "mood_history",
  "visit",
  "settings",
  "focus",
  "legal",
] as const;

export type AnalyticsScreenName = typeof ANALYTICS_SCREEN_NAMES[number];
export type AnalyticsNavigationType = "initial" | "route_change";

export type ScreenViewProperties = {
  screen_name: AnalyticsScreenName;
  previous_screen?: AnalyticsScreenName;
  navigation_type: AnalyticsNavigationType;
};

export function screenNameForPath(input: string): AnalyticsScreenName | null {
  const pathname = input.split(/[?#]/u, 1)[0];

  if (pathname === "/") return "home";
  if (pathname === "/auth/login") return "account";
  if (pathname === "/medications") return "medication_management";
  if (/^\/medications\/[^/]+\/schedule$/u.test(pathname)) {
    return "medication_schedule_edit";
  }
  if (pathname === "/medications/new" || pathname.startsWith("/medications/new/")) {
    return "medication_registration";
  }
  if (pathname === "/moods/new") return "mood_create";
  if (pathname === "/moods") return "mood_history";
  if (pathname === "/visits" || pathname === "/visits/new" || pathname === "/visits/edit") {
    return "visit";
  }
  if (pathname === "/terms" || pathname === "/privacy") return "legal";
  if (pathname === "/settings") return "settings";
  if (pathname === "/focus") return "focus";
  return null;
}

export function createScreenViewTransition(
  previousScreen: AnalyticsScreenName | null,
  pathname: string,
): { currentScreen: AnalyticsScreenName | null; properties: ScreenViewProperties | null } {
  const currentScreen = screenNameForPath(pathname);
  if (!currentScreen || currentScreen === previousScreen) {
    return { currentScreen: currentScreen ?? previousScreen, properties: null };
  }

  return {
    currentScreen,
    properties: {
      screen_name: currentScreen,
      ...(previousScreen ? { previous_screen: previousScreen } : {}),
      navigation_type: previousScreen ? "route_change" : "initial",
    },
  };
}
