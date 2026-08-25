import {
  initAnalytics,
  installAnalyticsReplayInteractionGuard,
  stopAnalyticsReplay,
  trackAppOpened,
} from "@/lib/analytics/mixpanel";

installAnalyticsReplayInteractionGuard();
initAnalytics();
trackAppOpened();

export function onRouterTransitionStart() {
  stopAnalyticsReplay();
}
