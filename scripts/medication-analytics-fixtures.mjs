import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import swc from "next/dist/build/swc/index.js";

// Same boundary-fixture approach as mood-analytics-fixtures: execute real page
// effects/callbacks, draft transitions, event queue and schema, without live writes.
const root = fileURLToPath(new URL("../", import.meta.url));
const date = "2026-08-28";
const tick = () => new Promise((resolve) => setImmediate(resolve));
const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
};
const candidate = (index = 1) => ({ name: `private-medication-${index}`, strengthValue: 10, strengthUnit: "mg", imagePath: "/fixture.svg" });
const version = "medication_registration_v2_instrumented";

function harness({ session = storage(), saveError, backend = "indexeddb", telemetryThrows = false, authThrows = false, authStalls = false, strict = false, saveGate } = {}) {
  const events = [], saved = [], navigations = [], requests = [];
  const cache = new Map();
  let slots = [], cursor = 0, dirty = false, tree, pending = [], Flow;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useState(initial) {
      const i = cursor++;
      slots[i] ??= { value: typeof initial === "function" ? initial() : initial };
      return [slots[i].value, (next) => { const value = typeof next === "function" ? next(slots[i].value) : next; if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; } }];
    },
    useMemo(factory, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { value: factory(), deps }; return slots[i].value; },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) { const previous = slots[i]; slots[i] = { deps }; pending.push(() => { previous?.cleanup?.(); slots[i].cleanup = effect(); }); }
    },
  };
  react.useLayoutEffect = react.useEffect;
  const router = { push: (href) => navigations.push(href), replace: (href) => navigations.push(href) };
  const repository = { storageBackend: backend, createMany: async (medications) => {
    if (saveGate) await saveGate;
    if (saveError) throw saveError;
    saved.push(...medications);
    return medications;
  } };
  const mocks = {
    react,
    "react/jsx-runtime": { Fragment: "Fragment", jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "next/image": { default: "Image" },
    "next/navigation": { useRouter: () => router },
    "@/lib/repositories": { getMedicationRepository: async () => repository },
    "@/lib/medication-enrichment": { enrichOfficialMedication: async (medication) => medication },
    "@/lib/frequent-medications": { FREQUENT_MEDICATIONS: [candidate(1), candidate(2)] },
    "@/lib/auth/client": { getAuthState: async () => {
      if (authThrows) throw Error("private-auth-error");
      if (authStalls) return new Promise(() => {});
      return { isAuthenticated: backend === "supabase" };
    } },
    "@/lib/supabase/config": { isSupabaseConfigured: () => true },
  };
  function load(specifier, parent = root + "/entry.ts") {
    if (mocks[specifier]) return mocks[specifier];
    if (specifier.startsWith("@/components/")) return new Proxy({}, { get: (_, key) => key });
    let filename = specifier.startsWith("@/") ? resolve(root, specifier.slice(2)) : resolve(dirname(parent), specifier);
    if (existsSync(filename + "/index.ts")) filename += "/index.ts";
    if (!existsSync(filename)) filename += existsSync(filename + ".ts") ? ".ts" : ".tsx";
    if (filename === resolve(root, "lib/analytics/mixpanel.ts")) return {
      trackAnalyticsEvent(name, authState, properties, pathname) {
        if (telemetryThrows) throw Error("private-transport-error");
        const payload = load("@/lib/analytics/schema").buildAnalyticsPayload({ eventName: name, authState, properties, environment: "production", pathname: pathname ?? window.location.pathname });
        assert.ok(payload, `valid payload: ${name}`);
        events.push({ name, ...payload });
        return true;
      },
    };
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const { code } = swc.transformSync(readFileSync(filename, "utf8"), {
      filename, module: { type: "commonjs" },
      jsc: { parser: { syntax: "typescript", tsx: filename.endsWith(".tsx") }, target: "es2022", transform: { react: { runtime: "automatic" } } },
    });
    runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })((next) => load(next, filename), module, module.exports);
    return module.exports;
  }
  globalThis.window = {
    sessionStorage: session, localStorage: storage(), crypto: globalThis.crypto,
    location: new URL(`https://fixture.invalid/medications/new/search?date=${date}`),
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: true }),
    setTimeout, clearTimeout,
  };
  globalThis.fetch = async (url) => {
    requests.push(url);
    return { ok: true, json: async () => ({ medications: [], status: "not-found" }) };
  };
  async function settle() {
    for (let pass = 0; pass < 24; pass++) {
      if (dirty && Flow) {
        dirty = false; cursor = 0; tree = Flow();
        const effects = pending; pending = [];
        effects.forEach((effect) => effect());
        // Repeat setup to exercise analytics idempotence as in Strict Mode.
        if (strict) effects.forEach((effect) => effect());
      }
      await tick();
    }
    assert.equal(dirty, false, "component settles");
  }
  async function mount(path) {
    slots.forEach((slot) => slot.cleanup?.());
    slots = []; pending = []; dirty = true;
    window.location = new URL(path.includes("?") ? path : `${path}?date=${date}`, window.location.origin);
    Flow = load(`@/app${window.location.pathname}/page`).default;
    await settle();
  }
  function nodes(node) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(node.props?.children)];
  }
  function find(type, predicate = () => true) {
    const node = nodes(tree).find((node) => node.type === type && predicate(node.props));
    assert.ok(node, `rendered ${type}`); return node.props;
  }
  const api = load("@/lib/analytics/events");
  const draft = load("@/lib/registration-session");
  async function start() {
    draft.resetDraft(); api.startMedicationAddAttempt("home", date);
    await mount("/medications/new/search");
  }
  async function select(index = 0) {
    const rows = nodes(tree).filter((node) => node.type === "button" && node.props.className?.startsWith("search-result-row"));
    rows[index].props.onClick(); await settle();
    await mount(navigations.at(-1));
  }
  async function schedule() {
    find("PrimaryButton", (props) => props.children === "다음으로").onClick(); await settle();
    await mount(navigations.at(-1));
  }
  async function nextSchedule() {
    find("button", (props) => props.role === "radio").onClick(); await settle();
    find("PrimaryButton").onClick(); await settle();
  }
  return { api, draft, load, session, events, saved, navigations, requests, mount, start, select, schedule, nextSchedule, settle, find,
    names: () => events.map((event) => event.name), retrySave: () => { saveError = undefined; },
    mock: (name, value) => { mocks[name] = value; }, rerender: async () => { dirty = true; await settle(); } };
}

let h = harness({ strict: true });
await h.start(); await h.select(); await h.schedule(); await h.nextSchedule();
assert.deepEqual(h.names(), ["medication_add_started", "medication_registration_step_viewed", "medication_registration_step_viewed", "medication_registration_step_viewed", "medication_save_clicked", "medication_added"]);
assert.deepEqual(h.events.filter((event) => event.step).map((event) => event.step), ["search", "review", "schedule"]);
assert.equal(new Set(h.events.map((event) => event.medication_attempt_id)).size, 1);
assert.ok(h.events.every((event) => event.flow_version === version));
assert.equal(h.events.at(-2).medication_count, 1);
assert.equal(h.saved.length, 1); assert.match(h.navigations.at(-1), /^\/\?medicationToast=added/);
assert.equal(h.session.getItem("addi-medication-registration-draft"), null);
assert.equal(JSON.stringify(h.events).includes("private"), false);
const completedId = h.events[0].medication_attempt_id;
h.api.trackMedicationAdded({ id: completedId, dateKey: date }); await h.settle();
assert.equal(h.names().filter((name) => name === "medication_added").length, 1);
await h.start(); assert.notEqual(h.events.at(-1).medication_attempt_id, completedId);
console.log("PASS normal real-page sequence, context/privacy, Strict Mode dedupe, repository success, next attempt");

h = harness(); await h.start(); await h.select();
const returnId = h.events[0].medication_attempt_id;
h.find("PrimaryButton", (props) => props.children === "다른 약 추가").onClick();
await h.mount(h.navigations.at(-1)); await h.select(1); await h.schedule();
await h.nextSchedule();
assert.equal(h.names().includes("medication_save_clicked"), false);
assert.equal(h.saved.length, 0);
await h.nextSchedule();
assert.equal(h.events.at(-2).medication_count, 2); assert.equal(h.saved.length, 2);
assert.equal(h.names().filter((name) => name === "medication_save_clicked").length, 1);
assert.deepEqual(h.events.filter((event) => event.step).map((event) => event.step), ["search", "review", "schedule"]);
assert.ok(h.events.every((event) => event.medication_attempt_id === returnId));
console.log("PASS add-another return preserves attempt; multiple medications save only on final Next");

h = harness(); await h.start();
const manualId = h.events[0].medication_attempt_id;
h.find("input").onChange({ target: { value: "private-manual" } }); await h.settle();
await new Promise((resolve) => setTimeout(resolve, 270)); await h.settle();
h.find("input").onKeyDown({ key: "Enter", preventDefault() {} }); await h.settle();
h.find("PrimaryButton").onClick(); await h.mount(h.navigations.at(-1));
h.find("PrimaryButton").onClick(); await h.mount(h.navigations.at(-1));
h.find("input").onChange({ target: { value: "12" } }); await h.settle();
h.find("PrimaryButton").onClick(); await h.settle(); await h.mount(h.navigations.at(-1));
await h.schedule(); await h.nextSchedule();
assert.ok(h.events.every((event) => event.medication_attempt_id === manualId));
assert.deepEqual(h.events.filter((event) => event.step).map((event) => event.step), ["search", "review", "schedule"]);
assert.equal(h.saved[0].registrationMethod, "manual");
assert.equal(JSON.stringify(h.events).includes("private"), false);
console.log("PASS actual manual-name/strength branch returns to review with the same attempt, no manual steps");

for (const [backend, error, expected] of [
  ["indexeddb", new DOMException("private-duplicate", "ConstraintError"), "duplicate"],
  ["indexeddb", new DOMException("private-abort", "AbortError"), "storage_error"],
  ["indexeddb", Error("duplicate network"), "storage_error"],
  ["supabase", { code: "23505", message: "private-duplicate" }, "duplicate"],
  ["supabase", { code: "42501", message: "private-auth" }, "auth_error"],
  ["supabase", { code: "23514", message: "private-validation" }, "validation_error"],
  ["supabase", new DOMException("private-network", "NetworkError"), "network"],
  ["supabase", new TypeError("Failed to fetch private"), "storage_error"],
  ["unknown", Error("duplicate"), "unknown"],
]) {
  h = harness({ backend, saveError: error }); await h.start(); await h.select(); await h.schedule(); await h.nextSchedule();
  assert.deepEqual(h.names().slice(-2), ["medication_save_clicked", "medication_registration_failed"]);
  assert.equal(h.events.at(-1).failure_type, expected); assert.equal(h.events.at(-1).storage_backend, backend);
  assert.equal(h.events.at(-1).stage, "save"); assert.equal(h.saved.length, 0);
  assert.equal(h.names().includes("medication_added"), false);
  assert.equal(JSON.stringify(h.events).includes("private"), false);
  const retryId = h.events.at(-1).medication_attempt_id;
  h.retrySave(); h.find("PrimaryButton").onClick(); await h.settle();
  assert.equal(h.events.at(-1).name, "medication_added"); assert.equal(h.events.at(-1).medication_attempt_id, retryId);
  assert.equal(h.names().filter((name) => name === "medication_save_clicked").length, 2);
}
console.log("PASS save failure categories 9/9, no raw errors, no false added, retry keeps ID");

h = harness(); await h.start(); await h.select();
const restoredId = h.events[0].medication_attempt_id, session = h.session;
h = harness({ session, strict: true }); await h.mount("/medications/new/review"); await h.rerender();
assert.deepEqual(h.names(), []);
await h.schedule(); await h.nextSchedule();
assert.ok(h.events.every((event) => event.medication_attempt_id === restoredId));
const firstNew = h.api.startMedicationAddAttempt("home", date);
const secondNew = h.api.startMedicationAddAttempt("home", date);
assert.notEqual(firstNew.id, secondNew.id, "explicit new draft never reuses an old attempt, even within 1s");
assert.equal(h.api.ensureMedicationAddAttempt("home", date).id, secondNew.id);
assert.notEqual(h.api.ensureMedicationAddAttempt("home", "2026-08-29").id, secondNew.id);
console.log("PASS session restoration, rerender dedupe, explicit restart and date isolation");

let releaseSave;
h = harness({ saveGate: new Promise((resolve) => { releaseSave = resolve; }) });
await h.start(); await h.select(); await h.schedule(); await h.nextSchedule();
assert.equal(h.names().includes("medication_added"), false);
assert.equal(h.saved.length, 0);
h.find("PrimaryButton").onClick(); await h.settle();
assert.equal(h.names().filter((name) => name === "medication_save_clicked").length, 1);
releaseSave(); await h.settle(); assert.equal(h.events.at(-1).name, "medication_added");
console.log("PASS added waits for actual createMany resolution, in-flight double click suppressed");

const postSaveSession = storage(), write = postSaveSession.setItem;
postSaveSession.setItem = (key, value) => { if (key === "addi-last-saved-medication-ids") throw Error("post-save storage error"); write(key, value); };
h = harness({ session: postSaveSession }); await h.start(); await h.select(); await h.schedule(); await h.nextSchedule();
assert.equal(h.saved.length, 1); assert.equal(h.events.at(-1).name, "medication_added");
assert.equal(h.names().includes("medication_registration_failed"), false);
console.log("PASS failure after repository success is not misreported as registration save failure");

for (const failure of ["transport", "auth", "stalled-auth", "analytics-session"]) {
  const optionalSession = storage(), get = optionalSession.getItem, set = optionalSession.setItem;
  if (failure === "analytics-session") {
    optionalSession.getItem = (key) => { if (key.startsWith("addi:analytics:")) throw Error("denied"); return get(key); };
    optionalSession.setItem = (key, value) => { if (key.startsWith("addi:analytics:")) throw Error("denied"); set(key, value); };
  }
  h = harness({ session: optionalSession, telemetryThrows: failure === "transport", authThrows: failure === "auth", authStalls: failure === "stalled-auth" });
  await h.start(); await h.select(); await h.schedule(); await h.nextSchedule();
  assert.equal(h.saved.length, 1); assert.match(h.navigations.at(-1), /^\/\?medicationToast=added/);
  if (failure === "analytics-session") assert.equal(new Set(h.events.map((event) => event.medication_attempt_id)).size, 1);
}
console.log("PASS SDK/auth/session failures and stalled analytics do not block selection, save or home navigation");

h = harness();
await h.api.trackMedicationTakenOnce("private-id", date);
await h.api.trackMedicationTakenOnce("private-id", date);
await h.settle();
assert.deepEqual(h.names(), ["medication_taken"]);
assert.equal(h.events[0].flow_version, undefined); assert.equal(h.events[0].medication_attempt_id, undefined);
await h.api.trackMedicationTakenOnce("private-id", "2026-08-29"); await h.settle();
assert.equal(h.events.length, 2);
console.log("PASS medication_taken retains same medication/date dedupe and no registration context");

h = harness(); await h.mount("/medications/new/review");
assert.deepEqual(h.names(), []); assert.match(h.navigations.at(-1), /\/search/);
await h.mount("/medications/new/schedule"); assert.deepEqual(h.names(), []);
await h.mount("/medications/new/search?origin=medications&date=2026-08-27");
assert.equal(h.events[0].source, "medication_management");
assert.equal(h.events[1].step, "search");
console.log("PASS redirect-only review/schedule produce no step; direct usable search establishes context");

h = harness();
const photoAttempt = h.api.ensureMedicationAddAttempt("medication_list", date);
h.draft.setPendingCandidates([candidate()], "photo"); h.draft.confirmPendingCandidates();
await h.mount("/medications/new/schedule"); await h.nextSchedule();
assert.deepEqual(h.names(), ["medication_add_started", "medication_added"]);
assert.equal(h.events.at(-1).medication_attempt_id, photoAttempt.id);
assert.equal(h.saved[0].registrationMethod, "photo");
console.log("PASS photo-only shared save preserves added with context, without new photo/step/save/failure events");

const schema = h.load("@/lib/analytics/schema");
const context = { medication_attempt_id: photoAttempt.id, flow_version: version };
const payload = (name, properties) => schema.buildAnalyticsPayload({ eventName: name, properties, environment: "production", authState: "guest", pathname: "/medications/new/schedule" });
for (const step of ["search", "review", "schedule"]) assert.ok(payload("medication_registration_step_viewed", { ...context, step }));
for (const step of ["manual_name", "photo", 1, "private"]) assert.equal(payload("medication_registration_step_viewed", { ...context, step }), null);
for (const count of [0, -1, 1.5, "1", NaN]) assert.equal(payload("medication_save_clicked", { ...context, medication_count: count }), null);
assert.equal(payload("medication_added", {}), null);
assert.equal(payload("medication_added", { ...context, medication_attempt_id: "private-name" }), null);
assert.equal(payload("medication_added", { ...context, flow_version: "mood_v2_instrumented" }), null);
assert.equal(payload("medication_registration_failed", { ...context, stage: "search", failure_type: "unknown", storage_backend: "unknown" }), null);
assert.equal(payload("medication_registration_failed", { ...context, stage: "save", failure_type: "private-message", storage_backend: "unknown" }), null);
assert.equal(payload("medication_registration_failed", { ...context, stage: "save", failure_type: "unknown", storage_backend: "private" }), null);
assert.deepEqual(payload("medication_added", { ...context, name: "private", strength: 10 }), { environment: "production", route: "medication_add", auth_state: "guest", ...context });
assert.equal(h.load("@/lib/analytics/screens").screenNameForPath("/medications/new/schedule"), "medication_schedule_edit");
console.log("PASS strict event allowlist, invalid context rejected, no input leakage; screen_viewed classification unchanged");

console.log("Medication analytics fixtures: 12/12 groups passed");
