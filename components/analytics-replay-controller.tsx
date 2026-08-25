"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { readAnalyticsConsent } from "@/lib/analytics/consent";
import {
  isAnalyticsReplayRequested,
  pauseAnalyticsReplay,
  resumeAnalyticsReplay,
  startAnalyticsReplay,
  stopAnalyticsReplay,
} from "@/lib/analytics/mixpanel";
import {
  ANALYTICS_REPLAY_INTERACTION_BLOCK_EVENT,
  ANALYTICS_REPLAY_PAUSE_SELECTOR,
  ANALYTICS_REPLAY_POLICY_CHANGE_EVENT,
  ANALYTICS_REPLAY_SAMPLE_STORAGE_KEY,
  getReplaySamplePercent,
  isPreviewReplayQaEnabled,
  isReplaySampleIncluded,
  isReplayUrlPrivacySafe,
  normalizeReplayRuntimeEnvironment,
  shouldStartReplay,
} from "@/lib/analytics/replay-policy";

const INTERACTION_RESUME_DELAY_MS = 400;

const replayRuntimeEnvironment = normalizeReplayRuntimeEnvironment(
  process.env.NEXT_PUBLIC_VERCEL_ENV,
);
const previewReplayQaEnabled = isPreviewReplayQaEnabled({
  qaMode: process.env.NEXT_PUBLIC_MIXPANEL_REPLAY_QA === "true",
  runtimeEnvironment: replayRuntimeEnvironment,
});

function hasReplayConsent() {
  return previewReplayQaEnabled || readAnalyticsConsent() === "granted";
}

function getRandomUnitValue() {
  try {
    const value = new Uint32Array(1);
    window.crypto.getRandomValues(value);
    return value[0] / 0x1_0000_0000;
  } catch {
    return Math.random();
  }
}

function getReplaySampleDecision(samplePercent: number) {
  if (samplePercent <= 0) return false;
  if (samplePercent >= 100) return true;

  const storageKey = `${ANALYTICS_REPLAY_SAMPLE_STORAGE_KEY}:${samplePercent}`;
  try {
    const stored = window.sessionStorage.getItem(storageKey);
    if (stored === "included") return true;
    if (stored === "excluded") return false;

    const included = isReplaySampleIncluded(samplePercent, getRandomUnitValue());
    window.sessionStorage.setItem(storageKey, included ? "included" : "excluded");
    return included;
  } catch {
    return false;
  }
}

function getTargetLocation(url: string | URL | null | undefined) {
  try {
    return new URL(url?.toString() ?? window.location.href, window.location.href);
  } catch {
    return null;
  }
}

export function AnalyticsReplayController() {
  const pathname = usePathname();
  const [policyVersion, setPolicyVersion] = useState(0);
  const [interactionSuspended, setInteractionSuspended] = useState(false);

  const refreshPolicy = useCallback(() => {
    setPolicyVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    let resumeTimer: number | null = null;
    const onInteractionBlocked = () => {
      setInteractionSuspended(true);
      if (resumeTimer !== null) window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => {
        setInteractionSuspended(false);
        resumeTimer = null;
      }, INTERACTION_RESUME_DELAY_MS);
    };
    window.addEventListener(
      ANALYTICS_REPLAY_INTERACTION_BLOCK_EVENT,
      onInteractionBlocked,
    );
    return () => {
      window.removeEventListener(
        ANALYTICS_REPLAY_INTERACTION_BLOCK_EVENT,
        onInteractionBlocked,
      );
      if (resumeTimer !== null) window.clearTimeout(resumeTimer);
    };
  }, []);

  useEffect(() => {
    setInteractionSuspended(false);
  }, [pathname]);

  useEffect(() => {
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    const wrapHistoryMethod = (original: History["pushState"]) => function wrappedHistoryMethod(
      this: History,
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ) {
      const target = getTargetLocation(url);
      if (!target || !isReplayUrlPrivacySafe({
        hash: target.hash,
        pathname: target.pathname,
        search: target.search,
      })) stopAnalyticsReplay();

      original.call(this, data, unused, url);
      window.setTimeout(() => {
        window.dispatchEvent(new Event(ANALYTICS_REPLAY_POLICY_CHANGE_EVENT));
      }, 0);
    };

    window.history.pushState = wrapHistoryMethod(originalPushState);
    window.history.replaceState = wrapHistoryMethod(originalReplaceState);

    const onPolicyChange = () => {
      if (!isReplayUrlPrivacySafe({
        hash: window.location.hash,
        pathname: window.location.pathname,
        search: window.location.search,
      })) stopAnalyticsReplay();
      refreshPolicy();
    };
    const onConsentChange = () => {
      if (!hasReplayConsent()) stopAnalyticsReplay();
      refreshPolicy();
    };
    const onPageHide = () => stopAnalyticsReplay();

    window.addEventListener("popstate", onPolicyChange);
    window.addEventListener("hashchange", onPolicyChange);
    window.addEventListener(ANALYTICS_REPLAY_POLICY_CHANGE_EVENT, onConsentChange);
    window.addEventListener("pagehide", onPageHide);

    let surfacePaused = Boolean(
      document.querySelector(ANALYTICS_REPLAY_PAUSE_SELECTOR),
    );
    const observer = new MutationObserver(() => {
      const nextSurfacePaused = Boolean(
        document.querySelector(ANALYTICS_REPLAY_PAUSE_SELECTOR),
      );
      if (nextSurfacePaused === surfacePaused) return;
      surfacePaused = nextSurfacePaused;
      if (surfacePaused) stopAnalyticsReplay();
      refreshPolicy();
    });
    observer.observe(document.body, {
      attributeFilter: ["data-mp-replay-pause"],
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", onPolicyChange);
      window.removeEventListener("hashchange", onPolicyChange);
      window.removeEventListener(ANALYTICS_REPLAY_POLICY_CHANGE_EVENT, onConsentChange);
      window.removeEventListener("pagehide", onPageHide);
      stopAnalyticsReplay();
    };
  }, [refreshPolicy]);

  useEffect(() => {
    const qaMode = process.env.NEXT_PUBLIC_MIXPANEL_REPLAY_QA === "true";
    const samplePercent = getReplaySamplePercent({
      qaMode,
      runtimeEnvironment: replayRuntimeEnvironment,
    });
    const startAllowed = shouldStartReplay({
      consentGranted: hasReplayConsent(),
      interactionSuspended,
      sampleIncluded: getReplaySampleDecision(samplePercent),
      surfacePaused: Boolean(document.querySelector(ANALYTICS_REPLAY_PAUSE_SELECTOR)),
      urlPrivacySafe: isReplayUrlPrivacySafe({
        hash: window.location.hash,
        pathname,
        search: window.location.search,
      }),
    });

    if (startAllowed) {
      if (isAnalyticsReplayRequested()) resumeAnalyticsReplay();
      else startAnalyticsReplay();
    } else if (interactionSuspended) {
      pauseAnalyticsReplay();
    } else {
      stopAnalyticsReplay();
    }
  }, [interactionSuspended, pathname, policyVersion]);

  return null;
}
