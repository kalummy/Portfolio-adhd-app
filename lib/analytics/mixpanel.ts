"use client";

import mixpanel from "mixpanel-browser/src/loaders/loader-module-core";
import { isAnalyticsPathBlocked } from "./path-policy";
import {
  buildAnalyticsPayload,
  type AnalyticsAuthState,
  type AnalyticsEnvironment,
  type AnalyticsEventName,
  type AnalyticsEventProperties,
} from "./schema";

type AnalyticsState = {
  appOpenedTracked: boolean;
  initialized: boolean;
};

const analyticsGlobal = globalThis as typeof globalThis & {
  __addiAnalyticsState?: AnalyticsState;
};

const analyticsState = analyticsGlobal.__addiAnalyticsState ??= {
  appOpenedTracked: false,
  initialized: false,
};

const analyticsEnvironment: AnalyticsEnvironment =
  process.env.NEXT_PUBLIC_VERCEL_ENV === "production"
    ? "production"
    : "development";

const URL_PROPERTY_BLACKLIST = [
  "$current_url",
  "$referrer",
  "$referring_domain",
  "$initial_referrer",
  "$initial_referring_domain",
  "$search_engine",
  "mp_keyword",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_id",
  "utm_source_platform",
  "utm_campaign_id",
  "utm_creative_format",
  "utm_marketing_tactic",
  "dclid",
  "fbclid",
  "gclid",
  "ko_click_id",
  "li_fat_id",
  "msclkid",
  "sccid",
  "ttclid",
  "twclid",
  "wbraid",
  "initial_utm_source",
  "initial_utm_medium",
  "initial_utm_campaign",
  "initial_utm_content",
  "initial_utm_term",
  "initial_utm_id",
  "initial_utm_source_platform",
  "initial_utm_campaign_id",
  "initial_utm_creative_format",
  "initial_utm_marketing_tactic",
] as const;

function isBrowser() {
  return typeof window !== "undefined";
}

export function getAnalyticsEnvironment(): AnalyticsEnvironment {
  return analyticsEnvironment;
}

export function initAnalytics(): boolean {
  if (!isBrowser()) return false;
  if (isAnalyticsPathBlocked(window.location.pathname)) return false;
  if (analyticsState.initialized) return true;

  const token = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN?.trim();
  if (!token) return false;

  try {
    mixpanel.init(token, {
      autocapture: false,
      debug: false,
      flags: false,
      ip: false,
      persistence: "localStorage",
      property_blacklist: [...URL_PROPERTY_BLACKLIST],
      record_console: false,
      record_block_selector: ".feedback-private-input",
      record_network: false,
      record_sessions_percent: 0,
      save_referrer: false,
      skip_first_touch_marketing: true,
      stop_utm_persistence: true,
      store_google: false,
      track_pageview: false,
    });
    analyticsState.initialized = true;
    return true;
  } catch {
    return false;
  }
}

export function trackAnalyticsEvent<T extends AnalyticsEventName>(
  eventName: T,
  authState: AnalyticsAuthState,
  properties: AnalyticsEventProperties<T>,
  pathnameOverride?: string,
): boolean {
  if (!isBrowser()) return false;
  const currentPathname = window.location.pathname;
  const pathname = pathnameOverride ?? currentPathname;
  if (
    isAnalyticsPathBlocked(currentPathname)
    || isAnalyticsPathBlocked(pathname)
    || !initAnalytics()
  ) return false;

  const payload = buildAnalyticsPayload({
    authState,
    environment: analyticsEnvironment,
    eventName,
    pathname,
    properties,
  });
  if (!payload) return false;

  try {
    mixpanel.track(eventName, payload);
    return true;
  } catch {
    return false;
  }
}

export function trackAppOpened(): boolean {
  if (analyticsState.appOpenedTracked) return false;
  const tracked = trackAnalyticsEvent("app_opened", "unknown", {});
  if (tracked) analyticsState.appOpenedTracked = true;
  return tracked;
}
