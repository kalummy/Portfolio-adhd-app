import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import swc from "next/dist/build/swc/index.js";

// Execute the real HomeScreen handler, state updates and Analytics queue/schema.
// Browser/React scheduling, repositories and SDK are local fixture boundaries.
// No database, Mixpanel or other external service is contacted.
const root = fileURLToPath(new URL("../", import.meta.url));
const date = "2026-08-28";
const version = "medication_taking_v2_instrumented";
const tick = () => new Promise((resolve) => setImmediate(resolve));
const medication = (id = "private-medication-1") => ({ id, name: "private-name", strengthValue: 10, strengthUnit: "mg", imagePath: "/fixture.svg", registrationMethod: "search", schedule: "daily", createdAt: date + "T00:00:00Z" });
const storage = () => {
  const values = new Map();
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
};
let currentErrors;
const onRejection = (error) => currentErrors.push(error);
process.on("unhandledRejection", onRejection);

function harness({ backend = "indexeddb", sdkThrows = false, authStalls = false, strict = false, preview = false, baseline = false, idThrows = false } = {}) {
  const events = [], operations = [], trace = [], errors = [], records = new Map();
  const config = { saveError: null, repositoryError: null, result: "valid", gate: null, reloadError: false, metadataThrows: false, guestSyncError: null };
  currentErrors = errors;
  const session = storage(), local = storage(), cache = new Map(), slots = [];
  let dirty = true, cursor = 0, pending = [], tree;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++; slots[i] ??= { value: typeof initial === "function" ? initial() : initial };
      return [slots[i].value, (next) => { const value = typeof next === "function" ? next(slots[i].value) : next; if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; } }];
    },
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useMemo(factory, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { value: factory(), deps }; return slots[i].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(effect, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) { const previous = slots[i]; slots[i] = { deps }; pending.push(() => { previous?.cleanup?.(); slots[i].cleanup = effect(); }); } },
  };
  react.useLayoutEffect = react.useEffect;
  const meds = [medication(), medication("private-medication-2")];
  const homeProps = { initialDateKey: date, referenceDateKey: date,
    ...(preview ? { previewData: { medications: meds, intakeRecords: [], moodRecords: [] } } : {}) };
  const repositories = {
    medications: { get storageBackend() { if (config.metadataThrows) throw Error("optional metadata"); return backend; }, listAll: async () => meds },
    medicationIntakes: {
      listAll: async () => { if (config.reloadError) throw Error("private-reload-error"); return [...records.values()]; },
      setTaken: async (medicationId, targetDate, taken) => {
        operations.push({ medicationId, date: targetDate, taken }); trace.push("setTaken");
        if (config.gate) await config.gate;
        if (config.saveError) throw config.saveError;
        const id = `${targetDate}:${medicationId}`;
        if (!taken) { records.delete(id); return null; }
        const record = { id, medicationId, date: targetDate, taken: true, recordedAt: targetDate + "T03:00:00Z" };
        if (config.result === "null") return null;
        if (config.result === "wrong-medication") record.medicationId = "private-wrong-id";
        if (config.result === "wrong-date") record.date = "2026-08-27";
        if (config.result === "not-taken") record.taken = false;
        records.set(id, record); return record;
      },
    },
    moods: { listAll: async () => [] }, visitSchedules: { getUpcoming: async () => null }, guestDatasetSync: { status: "no-local-data" },
  };
  const router = {};
  const mocks = {
    react, "react/jsx-runtime": { Fragment: "Fragment", jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "next/image": { default: "Image" }, "next/link": { default: "Link" }, "next/navigation": { useRouter: () => router },
    "@/lib/repositories": {
      getDataRepositories: async () => {
        trace.push("repository");
        if (config.repositoryError) throw config.repositoryError;
        return repositories;
      },
      runGuestDatasetSyncInBackground: async () => {
        trace.push("guestSync");
        if (config.guestSyncError) throw config.guestSyncError;
        return { status: "no-local-data" };
      },
    },
    "@/lib/auth/client": { getAuthState: async () => authStalls ? new Promise(() => {}) : { isAuthenticated: backend === "supabase" } },
    "@/lib/supabase/config": { isSupabaseConfigured: () => true },
    "@/lib/medication-enrichment": { enrichOfficialMedications: async (items) => items },
  };
  function load(specifier, parent = root + "/entry.ts") {
    if (mocks[specifier]) return mocks[specifier];
    let filename = specifier.startsWith("@/") ? resolve(root, specifier.slice(2)) : resolve(dirname(parent), specifier);
    if (!existsSync(filename)) filename += existsSync(filename + ".ts") ? ".ts" : ".tsx";
    if (filename.includes("/components/") && !filename.endsWith("/home-screen.tsx")) return new Proxy({}, { get: (_, key) => key });
    if (filename.endsWith("/client-id.ts") && idThrows) return { createClientId() { throw Error("analytics UUID failure"); } };
    if (filename.endsWith("/analytics/mixpanel.ts")) return { trackAnalyticsEvent(name, authState, properties, pathname) {
      if (sdkThrows) throw Error("private-SDK-error");
      const payload = load("@/lib/analytics/schema").buildAnalyticsPayload({ eventName: name, authState, properties, environment: "production", pathname: pathname ?? window.location.pathname });
      assert.ok(payload, name); events.push({ name, ...payload }); return true;
    } };
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const source = baseline && filename.endsWith("/components/home-screen.tsx")
      ? execFileSync("git", ["show", "26f1835:components/home-screen.tsx"], { cwd: root, encoding: "utf8" }) : readFileSync(filename, "utf8");
    const { code } = swc.transformSync(source, { filename, module: { type: "commonjs" }, jsc: { parser: { syntax: "typescript", tsx: filename.endsWith(".tsx") }, target: "es2022", transform: { react: { runtime: "automatic" } } } });
    runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })((next) => load(next, filename), module, module.exports);
    return module.exports;
  }
  globalThis.window = { location: new URL("https://fixture.invalid/?date=" + date), sessionStorage: session, localStorage: local, crypto: globalThis.crypto,
    history: { state: {}, replaceState() {} }, addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout };
  const api = load("@/lib/analytics/events");
  mocks["@/lib/analytics/events"] = { ...api, startMedicationTakeAttempt() { trace.push("clicked"); return api.startMedicationTakeAttempt(); } };
  const Home = load("@/components/home-screen").HomeScreen;
  async function settle() {
    for (let pass = 0; pass < 24; pass++) {
      if (dirty) {
        dirty = false; cursor = 0;
        tree = Home(homeProps);
        const effects = pending; pending = []; effects.forEach((effect) => effect());
        if (strict) effects.forEach((effect) => effect());
      }
      await tick();
    }
    assert.equal(dirty, false);
  }
  function nodes(node) { if (!node || typeof node !== "object") return []; if (Array.isArray(node)) return node.flatMap(nodes); return [node, ...nodes(node.props?.children)]; }
  function button(index = 0) { const item = nodes(tree).filter((node) => node.type === "button" && node.props.className === "medication-check")[index]; assert.ok(item); return item.props; }
  async function click(index = 0) { button(index).onClick(); await settle(); }
  return { api, config, events, operations, trace, errors, records, session, local, settle, click, button, load, nodes: () => nodes(tree),
    rerender: async () => { dirty = true; await settle(); }, taking: () => events.filter((event) => event.name.startsWith("medication_take_")), names: () => events.map((event) => event.name) };
}

try {
  for (const backend of ["indexeddb", "supabase"]) {
    const h = harness({ backend, strict: true }); await h.settle(); h.trace.length = 0; await h.click();
    assert.deepEqual(h.names(), ["medication_take_clicked", "medication_take_succeeded", "medication_taken"]);
    assert.equal(h.events[0].medication_take_attempt_id, h.events[1].medication_take_attempt_id);
    assert.ok(h.taking().every((event) => event.flow_version === version));
    assert.ok(h.events[1].duration_ms >= 0); assert.equal(h.button()["aria-pressed"], true);
    assert.deepEqual(h.trace.slice(0, 3), ["clicked", "repository", "setTaken"]);
    assert.equal(h.records.size, 1); assert.deepEqual(h.errors, []);
    await h.rerender(); assert.equal(h.taking().length, 2);
  }
  console.log("PASS normal click → success for both backends, click before repository/setTaken, Strict Mode/rerender stability");

  for (const [backend, error, expected] of [
    ["indexeddb", new DOMException("private abort", "AbortError"), "storage_error"],
    ["indexeddb", new DOMException("private constraint", "ConstraintError"), "storage_error"],
    ["supabase", { code: "42501", message: "private" }, "auth_error"],
    ["supabase", { code: "23514", message: "private" }, "validation_error"],
    ["supabase", new DOMException("private", "NetworkError"), "network"],
    ["supabase", new TypeError("network duplicate auth private"), "storage_error"],
    ["unknown", Error("network duplicate auth private"), "unknown"],
  ]) {
    const h = harness({ backend }); await h.settle(); h.config.saveError = error; await h.click();
    assert.deepEqual(h.names(), ["medication_take_clicked", "medication_take_failed"]);
    assert.equal(h.events[0].medication_take_attempt_id, h.events[1].medication_take_attempt_id);
    assert.equal(h.events[1].failure_type, expected); assert.equal(h.events[1].storage_backend, backend);
    assert.equal(h.records.size, 0); assert.equal(h.button()["aria-pressed"], false);
    assert.deepEqual(h.errors, [error], "original rejection is preserved");
    const failedId = h.events[0].medication_take_attempt_id;
    h.config.saveError = null; await h.click();
    assert.deepEqual(h.names().slice(-3), ["medication_take_clicked", "medication_take_succeeded", "medication_taken"]);
    assert.notEqual(h.taking().at(-1).medication_take_attempt_id, failedId);
    assert.equal(h.taking().at(-1).medication_take_attempt_id, h.taking().at(-2).medication_take_attempt_id);
    assert.equal(JSON.stringify(h.events).includes("private"), false);
  }
  console.log("PASS save errors 7/7, no legacy taken on rejection, retry creates a new ID, safe categories and original UI/error behavior");

  {
    const h = harness(); await h.settle(); const error = { status: 401, message: "private auth" }; h.config.repositoryError = error; await h.click();
    assert.deepEqual(h.names(), ["medication_take_clicked", "medication_take_failed"]);
    assert.equal(h.events[1].failure_type, "auth_error"); assert.equal(h.events[1].storage_backend, "unknown");
    assert.equal(h.operations.length, 0); assert.deepEqual(h.errors, [error]);
  }
  console.log("PASS repository acquisition failure is tracked before setTaken, unknown backend");

  {
    const h = harness(); await h.settle(); await h.click(); const id = h.events[0].medication_take_attempt_id;
    await h.click(); assert.equal(h.records.size, 0); assert.equal(h.button()["aria-pressed"], false); assert.equal(h.events.length, 3);
    await h.click(); assert.equal(h.records.size, 1); assert.equal(h.button()["aria-pressed"], true);
    assert.deepEqual(h.operations.map((operation) => operation.taken), [true, false, true]);
    assert.deepEqual(h.names().slice(-2), ["medication_take_clicked", "medication_take_succeeded"]);
    assert.notEqual(h.events.at(-1).medication_take_attempt_id, id);
    assert.equal(h.names().filter((name) => name === "medication_taken").length, 1, "legacy same-medication/date dedupe remains");
    assert.deepEqual(h.errors, []);
  }
  console.log("PASS cancel remains a delete with no new events; re-take gets new ID while medication_taken stays deduplicated");

  for (const result of ["null", "wrong-medication", "wrong-date", "not-taken"]) {
    const h = harness(); await h.settle(); h.config.result = result; await h.click();
    assert.deepEqual(h.names(), ["medication_take_clicked", "medication_take_failed", "medication_taken"]);
    assert.equal(h.events[1].failure_type, "validation_error"); assert.deepEqual(h.errors, []);
    // The legacy event is intentionally unchanged even for a resolved invalid
    // record. Compare actual pre-change Home behavior, rather than silently fixing it.
    const original = harness({ baseline: true }); await original.settle(); original.config.result = result; await original.click();
    assert.equal(original.button()["aria-pressed"], h.button()["aria-pressed"]);
    assert.deepEqual(original.names(), ["medication_taken"]);
    assert.deepEqual([...original.records], [...h.records]);
  }
  console.log("PASS 4 returned-record validation failures; diagnostic only, baseline UI/storage/legacy-event behavior unchanged");

  for (const mode of ["SDK", "UUID", "metadata", "slow-auth"]) {
    const h = harness({ sdkThrows: mode === "SDK", idThrows: mode === "UUID" }); await h.settle();
    if (mode === "metadata") h.config.metadataThrows = true;
    // Stall analytics auth after the initial product load, not Home's auth load.
    if (mode === "slow-auth") {
      const auth = h.load("@/lib/auth/client"); let calls = 0;
      auth.getAuthState = async () => ++calls === 1 ? new Promise(() => {}) : { isAuthenticated: false };
    }
    await h.click(); assert.equal(h.records.size, 1); assert.equal(h.button()["aria-pressed"], true); assert.deepEqual(h.errors, []);
    if (mode === "slow-auth") assert.deepEqual(h.events, []);
  }
  console.log("PASS SDK/ID/metadata failures and stalled telemetry do not block actual save or completion UI");

  {
    const h = harness(); await h.settle(); let release;
    h.config.gate = new Promise((resolve) => { release = resolve; });
    await h.click(0); await h.click(1);
    assert.deepEqual(h.names(), ["medication_take_clicked", "medication_take_clicked"]);
    assert.notEqual(h.events[0].medication_take_attempt_id, h.events[1].medication_take_attempt_id);
    assert.equal(h.records.size, 0);
    release(); await h.settle(); assert.equal(h.records.size, 2);
    for (const click of h.events.filter((event) => event.name === "medication_take_clicked")) {
      assert.equal(h.events.filter((event) => event.name === "medication_take_succeeded" && event.medication_take_attempt_id === click.medication_take_attempt_id).length, 1);
    }
    assert.deepEqual(h.errors, []);
  }
  console.log("PASS concurrent medication clicks keep independent IDs and wait for each repository result");

  {
    const h = harness(); await h.settle(); h.config.reloadError = true; await h.click();
    assert.deepEqual(h.taking().map((event) => event.name), ["medication_take_clicked", "medication_take_succeeded"]);
    assert.equal(h.records.size, 1); assert.deepEqual(h.errors, []);
    const preview = harness({ preview: true }); await preview.settle(); await preview.click();
    assert.deepEqual(preview.events, []); assert.equal(preview.operations.length, 0); assert.equal(preview.button()["aria-pressed"], true);
  }
  console.log("PASS post-save refresh failure is not a save failure; preview interaction remains untracked/local");

  {
    const h = harness({ backend: "supabase" });
    h.config.guestSyncError = Error("indexed_db_open_blocked");
    await h.settle();
    const shell = h.nodes().find((node) => node.type === "MobileShell");
    assert.equal(shell.props["data-guest-dataset-sync"], "failed");
    assert.equal(shell.props["data-home-data-failure"], undefined);
    assert.equal(h.nodes().some((node) => node.props?.role === "alert"), false);
    assert.ok(h.nodes().some((node) => node.type === "strong" && node.props?.children === "반가워요"));
  }
  console.log("PASS guest migration failure is diagnostic-only and member Home remains rendered");

  {
    const h = harness({ backend: "supabase" });
    h.config.reloadError = true;
    await h.settle();
    const shell = h.nodes().find((node) => node.type === "MobileShell");
    assert.equal(shell.props["data-home-data-failure"], "intake_failed");
    assert.ok(h.nodes().some((node) => node.props?.role === "alert"));
  }
  console.log("PASS member query failure keeps its value-free source and Home retry UI");

  {
    const h = harness(); await h.settle(); await h.click();
    assert.equal([...h.session.values.keys(), ...h.local.values.keys()].some((key) => key.includes("take-attempt") || key.includes("taking")), false);
    assert.ok(h.taking().every((event) => event.medication_attempt_id === undefined));
    assert.equal(h.events.at(-1).flow_version, undefined);
    const attempt = h.api.startMedicationTakeAttempt();
    h.api.trackMedicationTakeResult(attempt, { medicationId: "local-only", date, taken: true }, "local-only", date);
    h.api.trackMedicationTakeFailed(attempt, Error("late error")); await h.settle();
    assert.equal(h.taking().filter((event) => event.medication_take_attempt_id === attempt.id).length, 2);
    const schema = h.load("@/lib/analytics/schema");
    const context = { medication_take_attempt_id: attempt.id, flow_version: version };
    const payload = (name, props) => schema.buildAnalyticsPayload({ eventName: name, properties: props, authState: "guest", environment: "production", pathname: "/" });
    const clean = payload("medication_take_clicked", { ...context, medication_id: "private", medication_name: "private", strength: 10, medication_attempt_id: "private", message: "private" });
    assert.deepEqual(clean, { environment: "production", route: "home", auth_state: "guest", ...context });
    for (const duration_ms of [-1, NaN, Infinity, "1", undefined]) assert.equal(payload("medication_take_succeeded", { ...context, duration_ms }), null);
    assert.equal(payload("medication_take_clicked", { ...context, medication_take_attempt_id: "private" }), null);
    assert.equal(payload("medication_take_clicked", { ...context, flow_version: "medication_registration_v2_instrumented" }), null);
    assert.equal(payload("medication_take_failed", { ...context, duration_ms: 1, failure_type: "duplicate", storage_backend: "unknown" }), null);
    assert.equal(payload("medication_take_failed", { ...context, duration_ms: 1, failure_type: "unknown", storage_backend: "private" }), null);
  }
  console.log("PASS no persistent/registration attempt, no sensitive properties, strict schema and one terminal event per handle");

  console.log("Medication taking analytics fixtures: 11/11 groups passed");
} finally {
  process.removeListener("unhandledRejection", onRejection);
}
