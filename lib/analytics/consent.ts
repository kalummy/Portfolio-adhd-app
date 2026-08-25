"use client";

import { ANALYTICS_REPLAY_POLICY_CHANGE_EVENT } from "./replay-policy";

export const ANALYTICS_CONSENT_STORAGE_KEY = "addi:analytics-consent:v1";

export type AnalyticsConsentState = "unset" | "granted" | "denied";

type ConsentStorage = Pick<Storage, "getItem" | "setItem">;

function getBrowserStorage(): ConsentStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readAnalyticsConsent(
  storage: ConsentStorage | null = getBrowserStorage(),
): AnalyticsConsentState {
  if (!storage) return "unset";
  try {
    const value = storage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
    if (value === "granted" || value === "denied") return value;
  } catch {
    // Storage restrictions must leave optional analytics disabled.
  }
  return "unset";
}

export function writeAnalyticsConsent(
  nextState: Exclude<AnalyticsConsentState, "unset">,
  storage: ConsentStorage | null = getBrowserStorage(),
) {
  if (!storage) return false;
  try {
    storage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, nextState);
  } catch {
    return false;
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ANALYTICS_REPLAY_POLICY_CHANGE_EVENT));
  }
  return true;
}

export function grantAnalyticsConsent(storage?: ConsentStorage | null) {
  return writeAnalyticsConsent("granted", storage);
}

export function denyAnalyticsConsent(storage?: ConsentStorage | null) {
  return writeAnalyticsConsent("denied", storage);
}

export function withdrawAnalyticsConsent(storage?: ConsentStorage | null) {
  return writeAnalyticsConsent("denied", storage);
}
