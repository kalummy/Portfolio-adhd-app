import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import swc from "next/dist/build/swc/index.js";

// Run the real component callbacks/effects and analytics modules, with only the
// browser, React scheduler, transport and repository boundaries replaced.
// No live AI, database or Mixpanel writes; no new test dependencies.
const root = fileURLToPath(new URL("../", import.meta.url));
const date = "2026-08-28";
const tick = () => new Promise((resolve) => setImmediate(resolve));
const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
};

function harness({ session = storage(), analysisMode = "success", saveError, telemetryThrows = false, authThrows = false, authStalls = false, authResult, repositoryBackend = "indexeddb", history = false, strict = false } = {}) {
  const events = [], saved = [], navigations = [], requests = [], authCalls = [];
  const cache = new Map(), slots = [];
  let cursor = 0, dirty = true, tree, pending = [], mounted = false;
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
  const repository = { storageBackend: repositoryBackend, listAll: async () => [], listRecent: async () => [], findByDate: async () => null, save: async (record) => { if (saveError) throw saveError; saved.push(record); return record; } };
  const repositories = { moods: repository, medicationIntakes: { listByDate: async () => [] } };
  const mocks = {
    react,
    "react/jsx-runtime": { Fragment: "Fragment", jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "next/image": { default: "Image" },
    "next/link": { __esModule: true, default: "Link" },
    "@/components/use-mood-bottom-sheet": { useMoodBottomSheet: () => ({ mounted: false, entered: false, open() {}, close() {} }) },
    "next/server": { NextResponse: { json: (body, init) => ({ body, ...init }) } },
    "@/lib/repositories": { getDataRepositories: async () => repositories, getMoodRepository: async () => repository },
    "@/lib/auth/client": { getAuthState: async () => { authCalls.push(true); if (authResult) return authResult; if (authThrows) throw Error("private auth error"); if (authStalls) return new Promise(() => {}); return { isAuthenticated: false }; } },
    "@/lib/supabase/config": { isSupabaseConfigured: () => true },
  };
  function load(specifier, parent = root + "/entry.ts") {
    if (mocks[specifier]) return mocks[specifier];
    if (specifier.startsWith("@/components/")) return new Proxy({}, { get: (_, key) => key });
    let filename = specifier.startsWith("@/") ? resolve(root, specifier.slice(2)) : resolve(dirname(parent), specifier);
    if (!existsSync(filename)) filename += existsSync(filename + ".ts") ? ".ts" : ".tsx";
    if (filename === resolve(root, "lib/analytics/mixpanel.ts")) return {
      trackAnalyticsEvent(name, authState, properties) {
        if (telemetryThrows) throw Error("private transport error");
        const payload = load("@/lib/analytics/schema").buildAnalyticsPayload({ eventName: name, authState, properties, environment: "production", pathname: "/moods/new" });
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
    sessionStorage: session,
    location: { pathname: "/moods/new", origin: "https://fixture.invalid", assign: (url) => navigations.push(url), replace: (url) => navigations.push(url) },
    history: { state: {}, pushState() {}, replaceState() {}, back() {} },
    addEventListener() {}, removeEventListener() {}, scrollTo() {},
  };
  globalThis.fetch = async (url, options) => {
    requests.push(url);
    if (analysisMode === "network") throw new TypeError("private network error");
    if (analysisMode === "timeout") throw new DOMException("private timeout", "TimeoutError");
    if (analysisMode === "response_error") return { ok: true, json: async () => { throw SyntaxError("private JSON"); } };
    if (analysisMode === "validation_error") return { ok: true, json: async () => ({ result: {} }) };
    if (analysisMode === "body_stalls") return { ok: false, json: () => new Promise(() => {}) };
    if (analysisMode !== "success") return { ok: false, json: async () => ({ failure_type: analysisMode }) };
    const input = JSON.parse(options.body).input;
    return { ok: true, json: async () => load("@/lib/mood-analysis").createLocalPreviewMoodAnalysis(input) };
  };
  // Resolve this component directly; child presentation components remain stubs.
  const Flow = history ? load("./components/mood-history.tsx", root + "/entry.ts").MoodHistory : load("./components/mood-question-flow.tsx", root + "/entry.ts").MoodQuestionFlow;
  async function settle() {
    for (let pass = 0; pass < 20; pass++) {
      if (dirty) {
        dirty = false; cursor = 0;
        tree = Flow({ targetDateKey: date, lottieAvailability: { complete: false } });
        const effects = pending; pending = [];
        effects.forEach((effect) => effect());
        if (strict && !mounted) effects.forEach((effect) => effect());
        mounted = true;
      }
      await tick();
    }
    assert.equal(dirty, false, "component settles");
  }
  function nodes(node) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(node.props?.children)];
  }
  function find(type) { const node = nodes(tree).find((node) => node.type === type); assert.ok(node, `rendered ${type}`); return node.props; }
  async function step() { find("input").onChange(); await settle(); find("PrimaryButton").onClick(); await settle(); }
  async function answerAll() { await settle(); await step(); await step(); await step(); find("MoodSummaryLoading").onAnimationComplete(); await settle(); }
  return { events, saved, navigations, requests, authCalls, load, settle, step, answerAll, find, nodes: () => nodes(tree), session, mock: (name, value) => { mocks[name] = value; }, names: () => events.map((event) => event.name), retrySave: () => { saveError = undefined; } };
}

let h = harness({ strict: true });
await h.answerAll();
h.find("MoodResult").onSave(); await h.settle();
assert.deepEqual(h.names(), ["mood_started", "mood_step_completed", "mood_step_completed", "mood_step_completed", "mood_completed", "mood_analysis_started", "mood_analysis_succeeded", "mood_result_viewed", "cat_reward_revealed", "mood_save_clicked", "mood_saved"]);
assert.equal(new Set(h.events.map((event) => event.mood_attempt_id)).size, 1);
assert.ok(h.events.every((event) => event.flow_version === "mood_v2_instrumented"));
assert.deepEqual(h.events.filter((event) => event.name === "mood_step_completed").map((event) => event.step), [1, 2, 3]);
assert.equal(h.saved.length, 1); assert.equal(h.navigations.length, 1);
assert.equal(h.session.getItem(`addi:mood-draft:${date}`), null);
const oldId = h.events[0].mood_attempt_id;
assert.notEqual(h.load("@/lib/analytics/events").startMoodAttempt("home", date).id, oldId);
console.log("PASS real flow: normal sequence, common context, Strict Mode dedupe, success ends attempt");

for (const failure of ["network", "timeout", "configuration_error", "provider_error", "response_error", "validation_error", "api_error", "unknown", "private response text"]) {
  h = harness({ analysisMode: failure }); await h.answerAll();
  assert.equal(h.names().filter((name) => name === "mood_analysis_started").length, 1);
  assert.equal(h.names().filter((name) => name === "mood_analysis_failed").length, 1);
  assert.equal(h.names().includes("mood_result_viewed"), false);
  assert.equal(h.names().includes("mood_analysis_succeeded"), false);
  const event = h.events.find((event) => event.name === "mood_analysis_failed");
  assert.equal(event.failure_type, failure === "private response text" ? "api_error" : failure);
  assert.ok(event.duration_ms >= 0);
  assert.equal(JSON.stringify(h.events).includes("private"), false);
}
console.log("PASS analysis failures: request, timeout, API enums, malformed response, validation; no result");

h = harness({ saveError: new DOMException("private storage error", "QuotaExceededError") });
await h.answerAll(); h.find("MoodResult").onSave(); await h.settle();
assert.deepEqual(h.names().slice(-2), ["mood_save_clicked", "mood_save_failed"]);
assert.equal(h.names().includes("mood_saved"), false);
assert.equal(h.saved.length, 0);
assert.equal(h.events.at(-1).storage_backend, "indexeddb");
assert.equal(h.events.at(-1).failure_type, "storage_error");
const retryId = h.events[0].mood_attempt_id;
h.retrySave(); h.find("MoodResult").onSave(); await h.settle();
assert.equal(h.events.at(-1).name, "mood_saved");
assert.equal(h.events.at(-1).mood_attempt_id, retryId);
console.log("PASS save failure/retry: no false success, same attempt, actual repository success");

h = harness(); await h.settle(); await h.step();
const restoredId = h.events[0].mood_attempt_id, session = h.session;
assert.equal(JSON.parse(session.getItem(`addi:mood-draft:${date}`)).moodAttemptId, restoredId);
h = harness({ session, strict: true }); await h.settle();
assert.equal(h.names().includes("mood_started"), false);
await h.step(); await h.step(); h.find("MoodSummaryLoading").onAnimationComplete(); await h.settle();
assert.ok(h.events.every((event) => event.mood_attempt_id === restoredId));
const eventsApi = h.load("@/lib/analytics/events");
const handle = eventsApi.ensureMoodAttempt("home", date, restoredId);
eventsApi.trackMoodCompleted(handle); eventsApi.trackMoodResultViewed(handle); eventsApi.trackMoodStepCompleted(3, handle);
eventsApi.trackMoodCatRewardRevealed("white", handle); await h.settle();
assert.equal(h.names().filter((name) => name === "mood_result_viewed").length, 1);
assert.equal(h.names().filter((name) => name === "cat_reward_revealed").length, 1);
assert.notEqual(eventsApi.startMoodAttempt("home", "2026-08-27").id, restoredId);
assert.equal(eventsApi.startMoodAttempt("home", date).id, restoredId);
eventsApi.endMoodAttempt(handle);
assert.notEqual(eventsApi.startMoodAttempt("home", date).id, restoredId);
console.log("PASS draft reload/date isolation/discard and existing-event duplicate suppression");

for (const failure of ["transport", "auth", "session"]) {
  const blockedStorage = { getItem() { throw Error("storage denied"); }, setItem() { throw Error("storage denied"); }, removeItem() { throw Error("storage denied"); } };
  h = harness({ telemetryThrows: failure === "transport", authThrows: failure === "auth", ...(failure === "session" ? { session: blockedStorage } : {}) });
  await h.answerAll(); h.find("MoodResult").onSave(); await h.settle();
  assert.equal(h.saved.length, 1); assert.equal(h.navigations.length, 1);
  if (failure !== "transport") assert.equal(new Set(h.events.map((event) => event.mood_attempt_id)).size, 1);
}
console.log("PASS analytics transport/auth/storage failures do not block analysis, result or save");

h = harness({ authStalls: true });
await h.answerAll(); h.find("MoodResult").onSave(); await h.settle();
await new Promise((resolve) => setTimeout(resolve, 550));
assert.equal(h.saved.length, 1); assert.equal(h.navigations.length, 1);
assert.equal(h.session.getItem(`addi:mood-draft:${date}`), null);
console.log("PASS stalled analytics auth cannot block successful-save cleanup/navigation");

const schema = h.load("@/lib/analytics/schema"), contract = h.load("@/lib/analytics/mood-contract");
const context = { mood_attempt_id: crypto.randomUUID(), flow_version: contract.MOOD_FLOW_VERSION };
for (const cat of h.load("@/lib/cats").REWARD_CAT_IDS) {
  const payload = schema.buildAnalyticsPayload({ eventName: "cat_reward_revealed", authState: "guest", environment: "production", pathname: "/moods/new", properties: { ...context, cat_id: cat, answer: "private", message: "private" } });
  assert.equal(payload.cat_id, cat); assert.equal(JSON.stringify(payload).includes("private"), false);
}
for (const [stage, code, expected] of [
  ["provider_runtime", "provider_timeout", "timeout"], ["provider_runtime", "provider_fetch_failed", "network"],
  ["provider_runtime", "provider_not_configured", "configuration_error"], ["provider_http", "private", "provider_error"],
  ...["response_body", "output_extract", "output_json"].map((stage) => [stage, "private", "response_error"]),
  ...["schema_validation", "evidence_grounding", "medical_safety", "quality_validation"].map((stage) => [stage, "private", "validation_error"]),
  ["provider_runtime", "private", "unknown"],
]) assert.equal(contract.classifyMoodAnalysisDiagnostic({ stage, code }), expected);
console.log("PASS 11 cat IDs, safe provider diagnostic mapping and sensitive-field allowlist");

const apiHarness = harness();
const analysis = apiHarness.load("@/lib/mood-analysis");
const provider = apiHarness.load("@/lib/openai-mood-provider");
const input = analysis.createMoodAnalysisInput({ date, recordedAt: "2026-08-28T00:00:00.000Z", stepOneKind: "medication_effect", intakeMedicationIds: [], answers: ["similar", "anxious", "none"].map((id) => ({ selected: [id], customText: "", timingsByOption: {} })) });
let providerError;
apiHarness.mock("@/lib/openai-mood-provider", { ...provider, requestOpenAIMoodAnalysis: async () => { if (providerError) throw providerError; return analysis.createLocalPreviewMoodAnalysis(input); } });
const { POST } = apiHarness.load("@/app/api/moods/analyze/route");
const envBefore = { key: process.env.OPENAI_API_KEY, vercel: process.env.VERCEL_ENV };
const originalConsoleError = console.error;
try {
  process.env.VERCEL_ENV = "production"; delete process.env.OPENAI_API_KEY;
  let response = await POST({ json: async () => ({ input }) });
  assert.equal(response.status, 503); assert.equal(response.body.failure_type, "configuration_error");
  response = await POST({ json: async () => ({ input: {} }) });
  assert.equal(response.status, 400); assert.equal(response.body.failure_type, "validation_error");
  process.env.OPENAI_API_KEY = "fixture-only-no-network";
  response = await POST({ json: async () => ({ input }) });
  assert.ok(response.body.result); assert.equal(response.body.failure_type, undefined);
  console.error = () => {};
  for (const [stage, code, expected] of [["provider_runtime", "provider_timeout", "timeout"], ["schema_validation", "invalid_schema", "validation_error"], ["provider_http", "private-provider-code", "provider_error"]]) {
    providerError = new provider.MoodAnalysisProviderError(stage, code);
    response = await POST({ json: async () => ({ input }) });
    assert.equal(response.status, 422);
    assert.deepEqual(response.body, { code: "ANALYSIS_FAILED", failure_type: expected });
  }
} finally {
  if (envBefore.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = envBefore.key;
  if (envBefore.vercel === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = envBefore.vercel;
  console.error = originalConsoleError;
}
const classifySave = apiHarness.load("@/lib/analytics/mood-save-failure").classifyMoodSaveFailure;
const Duplicate = apiHarness.load("@/lib/repositories/moods/types").DuplicateMoodRecordError;
assert.equal(classifySave(new Duplicate(), "supabase"), "duplicate");
assert.equal(classifySave({ __isAuthError: true }, "unknown"), "auth_error");
assert.equal(classifySave({ code: "PGRST301" }, "supabase"), "auth_error");
assert.equal(classifySave({ code: "42501" }, "supabase"), "storage_error");
assert.equal(classifySave(new DOMException("private", "DataCloneError"), "indexeddb"), "validation_error");
assert.equal(classifySave({ message: "private network message" }, "supabase"), "unknown");
console.log("PASS API status/success compatibility and safe analysis/save error categories");

// A non-OK response whose body never ends must not hold product failure state.
h = harness({ analysisMode: "body_stalls" });
await h.answerAll();
const bodyContract = h.load("@/lib/analytics/mood-contract");
await new Promise((resolve) => setTimeout(resolve, bodyContract.MOOD_ERROR_BODY_WAIT_MS + 20));
await h.settle();
assert.equal(h.events.at(-1).name, "mood_analysis_failed");
assert.equal(h.events.at(-1).failure_type, "api_error");
assert.equal(JSON.parse(h.session.getItem(`addi:mood-draft:${date}`)).analysisFailed, true);
assert.equal(h.names().includes("mood_result_viewed"), false);
for (const json of [() => { throw Error("private"); }, async () => { throw SyntaxError("private"); }, async () => ({ failure_type: "private" })]) {
  assert.equal(await bodyContract.readMoodAnalysisFailure({ json }), "api_error");
}
let finishBody;
const lateBody = bodyContract.readMoodAnalysisFailure({ json: () => new Promise((resolve) => { finishBody = resolve; }) });
assert.equal(await lateBody, "api_error");
finishBody({ failure_type: "provider_error" });
await tick();
assert.equal(h.names().filter((name) => name === "mood_analysis_failed").length, 1);
console.log("PASS bounded diagnostic body: stalled, malformed, rejected and late body; product failure preserved");

// Shared queue is blocked by an unrelated event; all mood callbacks must still
// reach SDK in order, using the repository context, without extra auth calls.
let finishBlockedAuth;
h = harness({ authResult: new Promise((resolve) => { finishBlockedAuth = resolve; }), repositoryBackend: "supabase" });
let api = h.load("@/lib/analytics/events");
api.trackVisitAdded(); await tick();
api.startMoodAttempt("home", date);
await h.answerAll(); h.find("MoodResult").onSave(); await h.settle();
assert.equal(h.events.at(-1).name, "mood_saved");
assert.equal(h.authCalls.length, 1, "only the deliberately blocked unrelated event reads auth");
assert.ok(h.events.every((event) => event.auth_state === "member"));
assert.equal(h.navigations.length, 1);
const moodEventsBeforeRelease = h.events.filter((event) => event.mood_attempt_id);
finishBlockedAuth({ isAuthenticated: true }); await h.settle();
assert.deepEqual(h.events.filter((event) => event.mood_attempt_id), moodEventsBeforeRelease);

for (const authDelay of [499, 500, 501]) {
  let finishAuth;
  h = harness({ authResult: new Promise((resolve) => { finishAuth = resolve; }) });
  api = h.load("@/lib/analytics/events");
  const attempt = api.startMoodAttempt("home", date);
  await tick(); // Auth request is already pending when save succeeds.
  api.trackMoodStepCompleted(1, attempt);
  api.trackMoodSaveClicked(attempt);
  const done = api.trackMoodSaved(attempt, "supabase");
  // Assert SDK was invoked synchronously, not just after the navigation timeout.
  assert.deepEqual(h.names(), ["mood_started", "mood_step_completed", "mood_save_clicked", "mood_saved"]);
  assert.ok(h.events.every((event) => event.auth_state === "member"));
  await done;
  await new Promise((resolve) => setTimeout(resolve, authDelay));
  finishAuth({ isAuthenticated: true });
  // API-only case: drain the queue without mounting a new recording flow.
  for (let turn = 0; turn < 20; turn += 1) await tick();
  assert.equal(h.events.length, 4, `no second SDK dispatch after ${authDelay}ms auth resolution`);
}

// Unknown context remains bounded, without guessing member/guest for delivery.
h = harness({ authStalls: true });
api = h.load("@/lib/analytics/events");
const unknownAttempt = api.startMoodAttempt("home", date);
await tick();
const realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;
let deadline, timeoutCallback, settled = false;
try {
  globalThis.setTimeout = (callback, ms) => { deadline = ms; timeoutCallback = callback; return 1; };
  globalThis.clearTimeout = () => {};
  const completion = api.trackMoodSaved(unknownAttempt).then(() => { settled = true; });
  await tick();
  assert.equal(deadline, 500); assert.equal(settled, false);
  timeoutCallback(); await completion;
  assert.equal(settled, true);
} finally {
  globalThis.setTimeout = realSetTimeout; globalThis.clearTimeout = realClearTimeout;
}
console.log("PASS blocked queue, repository auth reuse, SDK-before-navigation, 499/500/501ms races and bounded unknown context");

assert.equal(classifySave(new Duplicate(), "indexeddb"), "storage_error");
assert.equal(classifySave(new Duplicate(), "unknown"), "unknown");
assert.equal(classifySave(new DOMException("private", "ConstraintError"), "indexeddb"), "duplicate");
assert.equal(classifySave(new DOMException("private", "AbortError"), "indexeddb"), "storage_error");
assert.equal(classifySave(new Error("ConstraintError duplicate already exists"), "indexeddb"), "storage_error");
assert.equal(classifySave(new Duplicate(), "supabase"), "duplicate");
// Lock the repository evidence assumptions without modifying its transaction.
const indexedDbSource = readFileSync(resolve(root, "lib/indexed-db.ts"), "utf8");
const supabaseSource = readFileSync(resolve(root, "lib/repositories/moods/supabase.ts"), "utf8");
assert.match(indexedDbSource, /transaction\.error \?\? new DuplicateMoodRecordError\(\)/);
assert.match(supabaseSource, /if \(error\?\.code === "23505"\) throw new DuplicateMoodRecordError\(\)/);
console.log("PASS ambiguous abort vs confirmed constraint: conservative classification, no error-message guessing");

const RealDate = globalThis.Date;
let clock;
try {
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  };
  for (const tab of ["records", "report"]) {
    clock = RealDate.parse("2026-08-28T14:59:59.000Z"); // KST 23:59:59
    h = harness({ history: true }); await h.settle();
    if (tab === "report") {
      h.nodes().find((node) => node.props?.role === "tab" && node.props.children === "리포트").props.onClick();
      await h.settle();
    }
    const link = h.nodes().find((node) => node.type === "Link" && node.props.href.startsWith("/moods/new")).props;
    assert.equal(link.href, `/moods/new?date=${date}`);
    clock = RealDate.parse("2026-08-28T15:00:01.000Z"); // KST next day, no rerender
    link.onClick(); await h.settle();
    const state = JSON.parse(h.session.getItem(`addi:analytics:mood-attempt:v2:${date}`));
    assert.equal(state.dateKey, new URL(link.href, "https://fixture.invalid").searchParams.get("date"));
    assert.equal(state.id, h.events.find((event) => event.name === "mood_started").mood_attempt_id);
    assert.equal(h.session.getItem("addi:analytics:mood-attempt:v2:2026-08-29"), null);
  }
} finally { globalThis.Date = RealDate; }
console.log("PASS midnight boundary for both history links: actual href date equals attempt date");
console.log("mood analytics fixtures: 12/12 groups passed");
