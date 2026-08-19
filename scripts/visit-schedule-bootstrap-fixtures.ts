import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
// @ts-expect-error Node's type-stripping fixture runner imports the production TypeScript module directly.
import { bootstrapGuestDataset } from "../lib/repositories/guest-dataset-bootstrap.ts";

type Visit = {
  visitDate: string;
  createdAt: string;
  updatedAt: string;
};

type Reservation = {
  datasetId: string;
  visit: Visit;
  medications: string[];
  intakes: string[];
};

type State = {
  serverVisit: Visit;
  claims: Set<string>;
  activeReservation: Reservation | null;
  rotations: number;
  releases: number;
  repositoryReads: number;
};

const SERVER_VISIT: Visit = {
  visitDate: "2026-09-01",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

function createState(
  datasetId: string,
  visitDate = SERVER_VISIT.visitDate,
  medications: string[] = [],
  intakes: string[] = [],
): State {
  return {
    serverVisit: structuredClone(SERVER_VISIT),
    claims: new Set(),
    activeReservation: {
      datasetId,
      visit: {
        visitDate,
        createdAt: "2026-08-19T00:00:00.000Z",
        updatedAt: "2026-08-19T00:00:00.000Z",
      },
      medications,
      intakes,
    },
    rotations: 0,
    releases: 0,
    repositoryReads: 0,
  };
}

function dependencies(state: State) {
  return {
    userId: "user-a",
    reserve: async () => state.activeReservation,
    merge: async (reservation: Reservation) => {
      if (state.claims.has(reservation.datasetId)) {
        return { success: true, claimed: true, failureReason: "already_claimed" };
      }
      if (
        reservation.visit.visitDate !== state.serverVisit.visitDate
        && Date.parse(reservation.visit.updatedAt) > Date.parse(state.serverVisit.updatedAt)
      ) {
        state.serverVisit = {
          ...reservation.visit,
          createdAt: state.serverVisit.createdAt,
        };
      }
      state.claims.add(reservation.datasetId);
      return { success: true, claimed: true };
    },
    complete: async () => {
      state.activeReservation = null;
      state.rotations += 1;
    },
    release: async () => {
      state.releases += 1;
    },
  };
}

async function getUpcoming(state: State) {
  state.repositoryReads += 1;
  return state.serverVisit;
}

async function runLoginBootstrap(state: State) {
  const result = await bootstrapGuestDataset(dependencies(state));
  const visit = await getUpcoming(state);
  return { result, visit };
}

const cases: Array<[string, () => Promise<void>]> = [
  ["QA 9 same-date visit-only dataset claims, rotates, and reads server visit", async () => {
    const state = createState("dataset-visit-only");
    const before = structuredClone(state.serverVisit);
    const { result, visit } = await runLoginBootstrap(state);
    assert.equal(result.status, "merged");
    assert.equal(state.claims.size, 1);
    assert.equal(state.rotations, 1);
    assert.deepEqual(state.serverVisit, before);
    assert.deepEqual(visit, before);
    assert.equal(state.repositoryReads, 1);
  }],
  ["QA 9 same-date medication and intake dataset follows the same client flow", async () => {
    const state = createState("dataset-full", SERVER_VISIT.visitDate, ["med-a"], ["intake-a"]);
    const { result, visit } = await runLoginBootstrap(state);
    assert.equal(result.status, "merged");
    assert.equal(state.claims.size, 1);
    assert.equal(state.rotations, 1);
    assert.ok(visit);
  }],
  ["same dataset retry is idempotent and rotates locally once", async () => {
    const state = createState("dataset-retry");
    state.claims.add("dataset-retry");
    const { result, visit } = await runLoginBootstrap(state);
    assert.equal(result.status, "merged");
    assert.equal(state.claims.size, 1);
    assert.equal(state.rotations, 1);
    assert.ok(visit);
  }],
  ["newer different-date guest visit replaces server and completes the claim", async () => {
    const state = createState("dataset-conflict", "2026-09-02");
    const { result, visit } = await runLoginBootstrap(state);
    assert.equal(result.status, "merged");
    assert.equal(state.claims.size, 1);
    assert.equal(state.activeReservation, null);
    assert.equal(state.rotations, 1);
    assert.equal(state.releases, 0);
    assert.equal(state.serverVisit.visitDate, "2026-09-02");
    assert.deepEqual(visit, state.serverVisit);
  }],
  ["merge exception preserves local data and still reads server visit", async () => {
    const state = createState("dataset-error");
    const reservation = state.activeReservation;
    const deps = dependencies(state);
    const result = await bootstrapGuestDataset({
      ...deps,
      merge: async () => { throw new Error("network_failed"); },
    });
    const visit = await getUpcoming(state);
    assert.equal(result.status, "failed");
    assert.equal(state.activeReservation, reservation);
    assert.equal(state.rotations, 0);
    assert.equal(state.releases, 1);
    assert.deepEqual(visit, SERVER_VISIT);
  }],
  ["reservation failure still switches to and reads the server repository", async () => {
    const state = createState("dataset-reservation-error");
    const deps = dependencies(state);
    const result = await bootstrapGuestDataset({
      ...deps,
      reserve: async () => { throw new Error("indexed_db_failed"); },
    });
    const visit = await getUpcoming(state);
    assert.equal(result.status, "failed");
    assert.deepEqual(visit, SERVER_VISIT);
    assert.equal(state.claims.size, 0);
    assert.equal(state.rotations, 0);
  }],
  ["merge failure UI exposes a readable error and retry control", async () => {
    const homeSource = await readFile(
      new URL("../components/home-screen.tsx", import.meta.url),
      "utf8",
    );
    assert.match(homeSource, /저장한 정보를 불러오지 못했어요\. 다시 시도해 주세요\./);
    assert.match(homeSource, /role="alert"/);
    assert.match(homeSource, /retryGuestDatasetSync/);
    assert.match(homeSource, /"다시 시도"/);
  }],
];

for (const [name, run] of cases) {
  await run();
  console.log(`PASS ${name}`);
}

console.log(`visit schedule bootstrap fixture cases: ${cases.length}/${cases.length} passed`);
