import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
// @ts-expect-error Node's type-stripping fixture runner imports the production TypeScript module directly.
import { createSingleFlight, HomeDataLoadError, identifyHomeDataFailure } from "../lib/home-load-orchestration.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const cases: Array<[string, () => Promise<void>]> = [
  ["mount pageshow and focus share one in-flight Home load", async () => {
    const request = deferred<string>();
    let calls = 0;
    const load = createSingleFlight(async () => {
      calls += 1;
      return request.promise;
    });

    const mount = load();
    const pageshow = load();
    const focus = load();
    assert.equal(mount, pageshow);
    assert.equal(mount, focus);
    assert.equal(calls, 1);

    request.resolve("member-data");
    assert.deepEqual(await Promise.all([mount, pageshow, focus]), [
      "member-data",
      "member-data",
      "member-data",
    ]);
  }],
  ["settled loads may refresh but never overlap", async () => {
    let calls = 0;
    const load = createSingleFlight(async () => ++calls);
    assert.equal(await load(), 1);
    assert.equal(await load(), 2);
    assert.equal(calls, 2);
  }],
  ["a failed load releases the single-flight lock for retry", async () => {
    let calls = 0;
    const load = createSingleFlight(async () => {
      calls += 1;
      if (calls === 1) throw new Error("transient");
      return "recovered";
    });
    await assert.rejects(load(), /transient/);
    assert.equal(await load(), "recovered");
    assert.equal(calls, 2);
  }],
  ["member data failures keep a value-free diagnostic source", async () => {
    await assert.rejects(
      identifyHomeDataFailure("moods_failed", Promise.reject(new Error("private-value"))),
      (error) => error instanceof HomeDataLoadError && error.source === "moods_failed",
    );
  }],
  ["authenticated repositories and guest sync stay on separate paths", async () => {
    const repositorySource = await readFile(
      new URL("../lib/repositories/index.ts", import.meta.url),
      "utf8",
    );
    const homeSource = await readFile(
      new URL("../components/home-screen.tsx", import.meta.url),
      "utf8",
    );
    const indexedDbSource = await readFile(
      new URL("../lib/indexed-db.ts", import.meta.url),
      "utf8",
    );
    const repositorySelection = repositorySource.slice(
      repositorySource.indexOf("export async function getDataRepositories"),
      repositorySource.indexOf("export async function runGuestDatasetSyncInBackground"),
    );
    const homeCriticalPath = homeSource.slice(
      homeSource.indexOf("const performLoad"),
      homeSource.indexOf("const load = useMemo"),
    );

    assert.match(repositorySelection, /auth\.getUser\(\)/);
    assert.doesNotMatch(repositorySelection, /auth\.getSession\(\)/);
    assert.doesNotMatch(repositorySelection, /migrateInitialLocalData/);
    assert.match(homeSource, /await runGuestDatasetSyncInBackground\(\)/);
    assert.doesNotMatch(homeCriticalPath, /runGuestDatasetSyncInBackground/);
    assert.match(homeSource, /void load\(\)\.then\(startGuestDatasetSync\)/);
    assert.doesNotMatch(homeSource, /retryGuestDatasetSync/);
    for (const source of [
      "medications_failed",
      "intake_failed",
      "moods_failed",
      "visits_failed",
    ]) {
      assert.match(homeSource, new RegExp(source));
    }
    assert.match(indexedDbSource, /request\.onblocked/);
    assert.match(indexedDbSource, /database\.onversionchange/);
    assert.match(indexedDbSource, /INDEXED_DB_OPEN_TIMEOUT_MS/);
  }],
];

for (const [name, run] of cases) {
  await run();
  console.log(`PASS ${name}`);
}

console.log(`Home load orchestration fixture cases: ${cases.length}/${cases.length} passed`);
