"use client";

import mixpanelLoader from "mixpanel-browser/dist/mixpanel-with-async-modules.cjs.js";
import type {
  BeforeSendHookPayload,
  Mixpanel,
  RequestOptions,
  Response,
} from "mixpanel-browser";
import { isAnalyticsPathBlocked } from "./path-policy";
import {
  ANALYTICS_REPLAY_ALLOW_INTERACTION_SELECTOR,
  ANALYTICS_REPLAY_BLOCK_SELECTOR,
  ANALYTICS_REPLAY_INTERACTION_BLOCK_EVENT,
  isReplayUrlPrivacySafe,
  sanitizeReplayHeatmapEvent,
} from "./replay-policy";
import {
  buildAnalyticsPayload,
  type AnalyticsAuthState,
  type AnalyticsEnvironment,
  type AnalyticsEventName,
  type AnalyticsEventProperties,
} from "./schema";

type ReplayCapableMixpanel = Mixpanel & {
  pause_session_recording(): void;
  resume_session_recording(): void;
};

const mixpanel = mixpanelLoader as unknown as ReplayCapableMixpanel;

export type AnalyticsDeliveryStatus =
  | "delivered"
  | "failed"
  | "timeout"
  | "skipped";

const IMMEDIATE_DELIVERY_TIMEOUT_MS = 1_200;

type AnalyticsState = {
  appOpenedTracked: boolean;
  initialized: boolean;
  replayInteractionGuardInstalled: boolean;
  replayHeatmapClickAllowed: boolean;
  replayPaused: boolean;
  replayRequested: boolean;
};

const analyticsGlobal = globalThis as typeof globalThis & {
  __addiAnalyticsState?: AnalyticsState;
};

const analyticsState = analyticsGlobal.__addiAnalyticsState ??= {
  appOpenedTracked: false,
  initialized: false,
  replayInteractionGuardInstalled: false,
  replayHeatmapClickAllowed: false,
  replayPaused: false,
  replayRequested: false,
};

const analyticsEnvironment: AnalyticsEnvironment =
  process.env.NEXT_PUBLIC_VERCEL_ENV === "production"
    ? "production"
    : "development";

const URL_PROPERTY_BLACKLIST = [
  "$current_url",
  "$el_attr__href",
  "current_url_search",
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

function sanitizeHeatmapEvent(
  payload: BeforeSendHookPayload,
): BeforeSendHookPayload | null {
  return sanitizeReplayHeatmapEvent(
    payload,
    analyticsState.replayHeatmapClickAllowed,
  );
}

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
      hooks: {
        before_send_events: sanitizeHeatmapEvent,
      },
      ip: false,
      persistence: "localStorage",
      property_blacklist: [...URL_PROPERTY_BLACKLIST],
      record_block_selector: `img, video, audio, .feedback-private-input, ${ANALYTICS_REPLAY_BLOCK_SELECTOR}`,
      record_canvas: false,
      record_console: false,
      record_heatmap_data: true,
      record_mask_all_inputs: true,
      record_mask_all_text: true,
      record_network: false,
      record_sessions_percent: 0,
      record_unmask_text_selector: "[data-mp-replay-public]",
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

export function startAnalyticsReplay(): boolean {
  if (!isBrowser()) return false;
  if (!isReplayUrlPrivacySafe({
    hash: window.location.hash,
    pathname: window.location.pathname,
    search: window.location.search,
  })) return false;
  if (!initAnalytics()) return false;
  if (analyticsState.replayRequested) return true;

  try {
    mixpanel.set_config({ record_heatmap_data: true });
    mixpanel.start_session_recording();
    analyticsState.replayPaused = false;
    analyticsState.replayRequested = true;
    return true;
  } catch {
    return false;
  }
}

export function stopAnalyticsReplay(): boolean {
  if (!isBrowser() || !analyticsState.initialized) return false;
  if (!analyticsState.replayRequested) return false;

  analyticsState.replayRequested = false;
  analyticsState.replayPaused = false;
  try {
    mixpanel.set_config({ record_heatmap_data: false });
    mixpanel.stop_session_recording();
    return true;
  } catch {
    return false;
  }
}

export function pauseAnalyticsReplay(): boolean {
  if (
    !isBrowser()
    || !analyticsState.replayRequested
    || analyticsState.replayPaused
  ) return false;

  try {
    mixpanel.set_config({ record_heatmap_data: false });
    mixpanel.pause_session_recording();
    analyticsState.replayPaused = true;
    return true;
  } catch {
    stopAnalyticsReplay();
    return false;
  }
}

export function resumeAnalyticsReplay(): boolean {
  if (
    !isBrowser()
    || !analyticsState.replayRequested
    || !analyticsState.replayPaused
  ) return false;

  try {
    mixpanel.resume_session_recording();
    mixpanel.set_config({ record_heatmap_data: true });
    analyticsState.replayPaused = false;
    return true;
  } catch {
    stopAnalyticsReplay();
    return false;
  }
}

export function isAnalyticsReplayRequested() {
  return analyticsState.replayRequested;
}

function shouldAllowReplayInteraction(target: EventTarget | null) {
  return target instanceof Element
    && Boolean(target.closest(ANALYTICS_REPLAY_ALLOW_INTERACTION_SELECTOR));
}

function blockUnapprovedReplayInteraction(event: Event) {
  if (!analyticsState.replayRequested) return;
  const interactionAllowed = shouldAllowReplayInteraction(event.target);
  if (event.type === "click") {
    analyticsState.replayHeatmapClickAllowed = interactionAllowed;
    window.queueMicrotask(() => {
      analyticsState.replayHeatmapClickAllowed = false;
    });
  }
  if (interactionAllowed) return;
  pauseAnalyticsReplay();
  window.dispatchEvent(new Event(ANALYTICS_REPLAY_INTERACTION_BLOCK_EVENT));
}

export function installAnalyticsReplayInteractionGuard() {
  if (!isBrowser() || analyticsState.replayInteractionGuardInstalled) return;
  analyticsState.replayInteractionGuardInstalled = true;

  window.addEventListener("pointerdown", blockUnapprovedReplayInteraction, true);
  window.addEventListener("click", blockUnapprovedReplayInteraction, true);
  window.addEventListener("keydown", blockUnapprovedReplayInteraction, true);
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

function isSuccessfulTrackResponse(response: Response) {
  return response === 1
    || (typeof response === "object" && response.status === 1);
}

export function trackAnalyticsEventWithDelivery<T extends AnalyticsEventName>(
  eventName: T,
  authState: AnalyticsAuthState,
  properties: AnalyticsEventProperties<T>,
  pathnameOverride?: string,
): Promise<AnalyticsDeliveryStatus> {
  if (!isBrowser()) return Promise.resolve("skipped");
  const currentPathname = window.location.pathname;
  const pathname = pathnameOverride ?? currentPathname;
  if (
    isAnalyticsPathBlocked(currentPathname)
    || isAnalyticsPathBlocked(pathname)
    || !initAnalytics()
  ) return Promise.resolve("skipped");

  const payload = buildAnalyticsPayload({
    authState,
    environment: analyticsEnvironment,
    eventName,
    pathname,
    properties,
  });
  if (!payload) return Promise.resolve("skipped");

  return new Promise((resolve) => {
    let settled = false;
    const finish = (status: AnalyticsDeliveryStatus) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(status);
    };
    const timer = window.setTimeout(
      () => finish("timeout"),
      IMMEDIATE_DELIVERY_TIMEOUT_MS,
    );
    const requestOptions = {
      send_immediately: true,
      timeout_ms: IMMEDIATE_DELIVERY_TIMEOUT_MS,
      transport: "xhr",
    } as RequestOptions & { timeout_ms: number };

    try {
      mixpanel.track(eventName, payload, requestOptions, (response) => {
        finish(isSuccessfulTrackResponse(response) ? "delivered" : "failed");
      });
    } catch {
      finish("failed");
    }
  });
}

export function trackAppOpened(): boolean {
  if (analyticsState.appOpenedTracked) return false;
  const tracked = trackAnalyticsEvent("app_opened", "unknown", {});
  if (tracked) analyticsState.appOpenedTracked = true;
  return tracked;
}
