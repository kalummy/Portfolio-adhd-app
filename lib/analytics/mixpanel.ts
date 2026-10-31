"use client";

import mixpanel from "mixpanel-browser/src/loaders/loader-module-core";
import type { Mixpanel } from "mixpanel-browser";
import sdkPackage from "mixpanel-browser/package.json";
import { readCleanupRecovery } from "../account-cleanup";
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
  blocked: boolean;
  epoch: string;
  pendingTracks: Set<Promise<void>>;
  pendingFinishes: Map<string, () => void>;
  cleanup: Promise<boolean> | null;
  queueClear: Promise<boolean> | null;
  listenerInstalled: boolean;
  privacyGeneration: number;
  preparedPackets: WeakMap<object, string>;
};

const analyticsGlobal = globalThis as typeof globalThis & {
  __addiAnalyticsState?: AnalyticsState;
};

const analyticsState = analyticsGlobal.__addiAnalyticsState ??= {
  appOpenedTracked: false,
  initialized: false,
  blocked: false,
  epoch: "initial",
  pendingTracks: new Set(),
  pendingFinishes: new Map(),
  cleanup: null,
  queueClear: null,
  listenerInstalled: false,
  privacyGeneration: 0,
  preparedPackets: new WeakMap(),
};
// A previously loaded client chunk only had initialized/appOpenedTracked.
// Retain that singleton but initialize the new privacy state on module upgrade.
analyticsState.blocked ??= false;
analyticsState.epoch ??= "initial";
analyticsState.pendingTracks ??= new Set();
analyticsState.pendingFinishes ??= new Map();
analyticsState.cleanup ??= null;
analyticsState.queueClear ??= null;
analyticsState.listenerInstalled ??= false;
analyticsState.privacyGeneration ??= 0;
analyticsState.preparedPackets ??= new WeakMap();

// These values are only local generation/consent metadata. They contain no
// member identifier or record and deliberately survive generic ADDI key cleanup.
const BOUNDARY_KEY = "addi_privacy_analytics_boundary_v1";
const QUEUE_EPOCH_PROPERTY = "__addi_cleanup_epoch";
const QUEUE_OPERATION_PROPERTY = "__addi_cleanup_operation";
const CLEANUP_WAIT_MS = 1_000;
// 2.82 documents these persistence options but omits them from its option types.
// Structural option variables preserve the public API without patching the SDK.
const BLOCK_TRACKING_ONLY = { clear_persistence: false, delete_user: false };
const RESTORE_PERSISTENCE = { enable_persistence: true, persistence_type: "localStorage" as const };
let privacyHookInstalled = false;
let batchGuardInstalled = false;
let observedStorageSession: string | null = null;
type AnalyticsBoundary = {
  version: 1;
  session: string;
  deletion: string;
  deleted: boolean;
  explicitOptOut: boolean;
  resetRequired: boolean;
};
const initialBoundary = (): AnalyticsBoundary => ({
  version: 1, session: "initial", deletion: "initial", deleted: false,
  explicitOptOut: false, resetRequired: false,
});

function readBoundary(): AnalyticsBoundary | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(BOUNDARY_KEY);
    if (!raw) return initialBoundary();
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (record.version !== 1 || typeof record.session !== "string"
      || typeof record.deletion !== "string" || record.session.length > 100
      || record.deletion.length > 100 || typeof record.deleted !== "boolean"
      || typeof record.explicitOptOut !== "boolean" || typeof record.resetRequired !== "boolean") return null;
    return record as AnalyticsBoundary;
  } catch { return null; }
}

function writeBoundary(value: AnalyticsBoundary): boolean {
  try {
    window.localStorage.setItem(BOUNDARY_KEY, JSON.stringify(value));
    const stored = readBoundary();
    return stored?.session === value.session && stored.deletion === value.deletion
      && stored.deleted === value.deleted && stored.resetRequired === value.resetRequired
      && stored.explicitOptOut === value.explicitOptOut;
  } catch { return false; }
}

function generation() {
  return window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Captured around Auth reads; a changed boundary invalidates the old response. */
export function getAnalyticsSessionBoundary(): string | null {
  return readBoundary()?.session ?? null;
}

type EventPacket = { event: string; properties: Record<string, unknown> };

function filterEvent(value: unknown, preparedEpoch?: string): EventPacket | null {
  // A persisted SDK queue is mutable browser data, not a trusted TS value.
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (typeof event.event !== "string" || !event.properties
    || typeof event.properties !== "object" || Array.isArray(event.properties)) return null;
  const originalProperties = event.properties as Record<string, unknown>;
  const boundary = readBoundary();
  if (!boundary || analyticsState.blocked || boundary.deleted || boundary.resetRequired
    || (analyticsState.initialized && mixpanel.has_opted_out_tracking())
    || readCleanupRecovery()?.reason === "account_deletion") {
    const operation = originalProperties[QUEUE_OPERATION_PROPERTY];
    if (typeof operation === "string") analyticsState.pendingFinishes.get(operation)?.();
    return null;
  }
  const queuedEpoch = preparedEpoch ?? originalProperties[QUEUE_EPOCH_PROPERTY];
  if (queuedEpoch !== boundary.deletion
    && !(queuedEpoch === undefined && boundary.deletion === "initial")) return null;
  // The local queue generation is never an external event property.
  const properties = { ...originalProperties };
  delete properties[QUEUE_EPOCH_PROPERTY];
  delete properties[QUEUE_OPERATION_PROPERTY];
  return { event: event.event, properties };
}

function beforeSendEvent(value: unknown): EventPacket | null {
  const packet = filterEvent(value);
  const epoch = readBoundary()?.deletion;
  if (packet && epoch) analyticsState.preparedPackets.set(packet, epoch);
  return packet;
}

type BatchSender = ((this: unknown, data: unknown, options: unknown, callback: (result: unknown) => void) => unknown)
  & { __addiOriginalSender?: BatchSender };

/**
 * SDK 2.82 intentionally skips before_send_events for persisted orphan entries.
 * This confined instance adapter guards the last batch send as well. It never
 * changes SDK sources or global transports. Every SDK upgrade must re-run the
 * actual orphan/queue contract fixtures before changing this version fence.
 */
function installBatchSendGuard(): boolean {
  if (batchGuardInstalled) return true;
  if (sdkPackage.version !== "2.82.0") return false;
  const value = (mixpanel as unknown as { request_batchers?: unknown }).request_batchers;
  if (!value || typeof value !== "object") return false;
  const events = (value as Record<string, unknown>).events as { sendRequest?: BatchSender } | undefined;
  if (!events || typeof events.sendRequest !== "function") return false;
  const original = events.sendRequest.__addiOriginalSender ?? events.sendRequest;
  const guarded: BatchSender = function (data, options, callback) {
    const accepted: EventPacket[] = [];
    if (Array.isArray(data)) {
      for (const item of data) {
        const preparedEpoch = item && typeof item === "object"
          ? analyticsState.preparedPackets.get(item) : undefined;
        const packet = filterEvent(item, preparedEpoch);
        if (!packet) continue;
        if (preparedEpoch && item && typeof item === "object") {
          // The SDK may persist its transformed copy during unload. Retain the
          // local generation there, while sending only the separate clean copy.
          (item as EventPacket).properties[QUEUE_EPOCH_PROPERTY] = preparedEpoch;
        }
        accepted.push(packet);
      }
    }
    if (!accepted.length) {
      // Local privacy discards are dequeued, not retried and not server ACKs.
      callback({ status: 1 });
      return true;
    }
    return original.call(this, accepted, options, callback);
  };
  Object.defineProperty(guarded, "__addiOriginalSender", { value: original });
  events.sendRequest = guarded;
  batchGuardInstalled = true;
  return true;
}

function installBoundaryListener() {
  if (analyticsState.listenerInstalled) return;
  analyticsState.listenerInstalled = true;
  window.addEventListener("storage", (event) => {
    if (event.key !== BOUNDARY_KEY) return;
    const boundary = readBoundary();
    const changedSession = boundary && observedStorageSession !== null
      && boundary.session !== observedStorageSession;
    observedStorageSession = boundary?.session ?? null;
    if (!boundary || boundary.deleted || boundary.deletion !== analyticsState.epoch) {
      analyticsState.blocked = true;
      if (analyticsState.initialized) {
        try { mixpanel.opt_out_tracking(BLOCK_TRACKING_ONLY); }
        catch { /* Remain blocked; cleanup cannot be reported complete here. */ }
      }
    }
    if (changedSession || !boundary || boundary.deleted) {
      void import("./events").then(({ resetAnalyticsSession }) => {
        const current = readBoundary();
        if (!current || !boundary || current.session !== boundary.session
          || current.deletion !== boundary.deletion) return;
        resetAnalyticsSession();
        if (changedSession && !current.deleted && !readCleanupRecovery()) resetAnalyticsIdentity();
      }).catch(() => undefined);
    }
  });
}

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

function initializeAnalytics(cleanupOnly = false): boolean {
  if (!isBrowser()) return false;
  if (!cleanupOnly && isAnalyticsPathBlocked(window.location.pathname)) return false;
  if (analyticsState.initialized) {
    try {
      installBoundaryListener();
      observedStorageSession ??= readBoundary()?.session ?? null;
      if (!privacyHookInstalled) {
        mixpanel.set_config({ hooks: { before_send_events: beforeSendEvent } });
        privacyHookInstalled = true;
      }
      return installBatchSendGuard();
    } catch { return false; }
  }

  const token = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN?.trim();
  if (!token) return false;

  try {
    const boundary = readBoundary();
    if (!boundary || (!cleanupOnly && boundary.deleted)) return false;
    analyticsState.epoch = boundary.deletion;
    observedStorageSession = boundary.session;
    installBoundaryListener();
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
      // A cleanup bootstrap must never deliver persisted orphan events first.
      batch_autostart: false,
      hooks: { before_send_events: beforeSendEvent },
    });
    analyticsState.initialized = true;
    privacyHookInstalled = true;
    if (!installBatchSendGuard()) { analyticsState.blocked = true; return false; }
    if (!cleanupOnly && boundary.resetRequired) {
      mixpanel.reset();
      if (!writeBoundary({ ...boundary, resetRequired: false })) return false;
    }
    if (!cleanupOnly && !mixpanel.has_opted_out_tracking()) {
      (mixpanel as unknown as Pick<Mixpanel, "start_batch_senders">).start_batch_senders();
    }
    return true;
  } catch {
    return false;
  }
}

export function initAnalytics(): boolean {
  const boundary = readBoundary();
  if (analyticsState.blocked || !boundary || boundary.deleted
    || readCleanupRecovery()?.reason === "account_deletion") return false;
  if (analyticsState.initialized && boundary.resetRequired) return false;
  if (analyticsState.initialized && analyticsState.epoch !== boundary.deletion) return false;
  return initializeAnalytics();
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
    const boundary = readBoundary();
    if (!boundary || boundary.deleted || boundary.deletion !== analyticsState.epoch) return false;
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const operation = generation();
    analyticsState.pendingTracks.add(pending);
    const completed = () => {
      analyticsState.pendingTracks.delete(pending);
      analyticsState.pendingFinishes.delete(operation);
      finish();
    };
    analyticsState.pendingFinishes.set(operation, completed);
    try {
      mixpanel.track(eventName, {
        ...payload,
        [QUEUE_EPOCH_PROPERTY]: boundary.deletion,
        [QUEUE_OPERATION_PROPERTY]: operation,
      }, {}, completed);
    } catch { completed(); return false; }
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

export function resetAnalyticsIdentity(): boolean {
  if (!isBrowser()) return false;
  const boundary = readBoundary();
  if (!boundary || boundary.deleted) { analyticsState.blocked = true; return false; }
  // Do not initialize an unused SDK merely to log out.
  if (!analyticsState.initialized) {
    const written = writeBoundary({ ...boundary, resetRequired: true });
    if (!written) analyticsState.blocked = true;
    return written;
  }

  try {
    mixpanel.reset();
    analyticsState.appOpenedTracked = false;
    if (!writeBoundary({ ...boundary, resetRequired: false })) {
      analyticsState.blocked = true;
      return false;
    }
    observedStorageSession = boundary.session;
    analyticsState.blocked = false;
    return true;
  } catch {
    analyticsState.blocked = true;
    return false;
  }
}

export function advanceAnalyticsLogoutBoundary(): void {
  analyticsState.privacyGeneration++;
  const boundary = readBoundary();
  const session = generation();
  if (!boundary || !writeBoundary({ ...boundary, session, resetRequired: true })) {
    analyticsState.blocked = true;
  } else observedStorageSession = session;
}

function projectKeys(token: string) {
  return [`__mpq_${token}_ev`, `__mpq_${token}_pp`, `__mpq_${token}_gr`, `mp_${token}_mixpanel`];
}

type AwaitableBatcher = { stop(): void; clear(): Promise<unknown> };

/**
 * Pinned SDK compatibility boundary. Public opt-out returns void and discards
 * the promises returned by batcher.clear(), so it cannot report a storage fault.
 * Only this facade awaits the 2.82.0 queue contract; no SDK object is patched.
 * https://github.com/mixpanel/mixpanel-js/blob/v2.82.0/src/request-batcher.js
 */
async function boundedCompletion(operation: Promise<boolean>): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<false>((resolve) => { timeout = setTimeout(() => resolve(false), CLEANUP_WAIT_MS); }),
    ]);
  } finally { if (timeout) clearTimeout(timeout); }
}

async function clearSdkQueues(): Promise<boolean> {
  if (analyticsState.queueClear) return boundedCompletion(analyticsState.queueClear);
  if (sdkPackage.version !== "2.82.0") return false;
  const value = (mixpanel as unknown as { request_batchers?: unknown }).request_batchers;
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const batchers: AwaitableBatcher[] = [];
  for (const name of ["events", "people", "groups"]) {
    const batcher = record[name] as Partial<AwaitableBatcher> | undefined;
    if (!batcher || typeof batcher.stop !== "function" || typeof batcher.clear !== "function") return false;
    batchers.push(batcher as AwaitableBatcher);
  }
  const operation = Promise.allSettled(batchers.map(async (batcher) => {
    batcher.stop();
    await batcher.clear();
  })).then((outcomes) => outcomes.every((outcome) => outcome.status === "fulfilled"));
  analyticsState.queueClear = operation;
  void operation.finally(() => {
    if (analyticsState.queueClear === operation) analyticsState.queueClear = null;
  });
  // A timeout does not cancel a browser storage operation. Retain it across
  // retries so a late clear can never race newly resumed account-B collection.
  return boundedCompletion(operation);
}

async function waitForTracks(): Promise<boolean> {
  if (!analyticsState.pendingTracks.size) return true;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.all([...analyticsState.pendingTracks]).then(() => true),
      new Promise<false>((resolve) => { timeout = setTimeout(() => resolve(false), CLEANUP_WAIT_MS); }),
    ]);
  } finally { if (timeout) clearTimeout(timeout); }
}

/** Purges only this project's local SDK state; never requests server erasure. */
export async function purgeDeletedAccountAnalytics(): Promise<boolean> {
  analyticsState.privacyGeneration++;
  analyticsState.blocked = true;
  if (analyticsState.cleanup) return analyticsState.cleanup;
  const operation = (async () => {
    const previous = readBoundary();
    if (!previous) return false;
    const token = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN?.trim();
    if (token && !initializeAnalytics(true)) return false;
    const boundary = previous.deleted ? previous : {
      ...previous, session: generation(), deletion: generation(), deleted: true,
      explicitOptOut: analyticsState.initialized ? mixpanel.has_opted_out_tracking() : false,
      resetRequired: true,
    };
    if (!writeBoundary(boundary)) return false;
    if (!token) return true; // A later configured instance must purge before resume.
    try {
      mixpanel.opt_out_tracking(BLOCK_TRACKING_ONLY);
      if (!await waitForTracks()) return false;
      if (!await clearSdkQueues()) return false;
      // Public persistence controls clear the identity store separately. Queue
      // faults above have been awaited rather than discarded by public opt-out.
      mixpanel.set_config({ disable_persistence: true });
      mixpanel.reset();
      for (let turn = 0; turn < 80; turn++) await Promise.resolve();
      const deadline = Date.now() + CLEANUP_WAIT_MS;
      do {
        if (projectKeys(token).every((key) => window.localStorage.getItem(key) === null)) {
          analyticsState.appOpenedTracked = false;
          return true;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 20));
      } while (Date.now() < deadline);
    } catch { /* Report pending, never a false local-erasure success. */ }
    return false;
  })();
  analyticsState.cleanup = operation;
  try { return await operation; }
  finally { analyticsState.cleanup = null; }
}

/** Called only after a normal verified sign-in callback, never from event props. */
export async function resumeAnalyticsAfterVerifiedSignIn(isCurrent: () => boolean): Promise<boolean> {
  const boundary = readBoundary();
  if (!boundary || !isCurrent()) return false;
  const unchanged = () => {
    const current = readBoundary();
    return isCurrent() && !readCleanupRecovery() && current !== null
      && current.session === boundary.session && current.deletion === boundary.deletion
      && current.deleted === boundary.deleted && current.explicitOptOut === boundary.explicitOptOut
      && current.resetRequired === boundary.resetRequired;
  };
  if (!boundary.deleted) {
    if (!analyticsState.blocked && !boundary.resetRequired) return true;
    // A logout may have completed while storage/SDK reset was unavailable.
    // Only the verified sign-in caller can finish that deferred ID boundary.
    if (readCleanupRecovery()) return false;
    const token = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN?.trim();
    if (!token || !initializeAnalytics(true) || !unchanged()) return false;
    try {
      if (analyticsState.initialized) {
        mixpanel.reset();
        if (!mixpanel.has_opted_out_tracking()) {
          (mixpanel as unknown as Pick<Mixpanel, "start_batch_senders">).start_batch_senders();
        }
      }
      if (!unchanged()) return false;
      if (!writeBoundary({ ...boundary, resetRequired: false })) return false;
      analyticsState.epoch = boundary.deletion;
      observedStorageSession = boundary.session;
      analyticsState.blocked = false;
      return true;
    } catch { return false; }
  }
  if (readCleanupRecovery()) return false;
  if (!process.env.NEXT_PUBLIC_MIXPANEL_TOKEN?.trim()) return false;
  const cleanup = purgeDeletedAccountAnalytics();
  const expectedGeneration = analyticsState.privacyGeneration;
  if (!await cleanup || expectedGeneration !== analyticsState.privacyGeneration || !unchanged()) return false;
  try {
    if (analyticsState.initialized) {
      if (!boundary.explicitOptOut) {
        mixpanel.set_config({ disable_persistence: false });
        mixpanel.clear_opt_in_out_tracking(RESTORE_PERSISTENCE);
      }
      mixpanel.reset();
      if (!boundary.explicitOptOut) {
        // This is a typed public instance method in the pinned SDK; the module
        // namespace declaration omits the equivalent runtime export.
        (mixpanel as unknown as Pick<Mixpanel, "start_batch_senders">).start_batch_senders();
      }
    }
    if (expectedGeneration !== analyticsState.privacyGeneration || !unchanged()
      || !writeBoundary({ ...boundary, deleted: false, resetRequired: false })) return false;
    analyticsState.epoch = boundary.deletion;
    observedStorageSession = boundary.session;
    analyticsState.blocked = false;
    return true;
  } catch { return false; }
}
