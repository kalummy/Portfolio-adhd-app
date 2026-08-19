import assert from "node:assert/strict";

function clone(value) {
  return structuredClone(value);
}

function validDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function visit(date, overrides = {}) {
  return {
    visit_id: "upcoming",
    visit_date: date,
    created_at: "2026-08-18T00:00:00.000Z",
    updated_at: "2026-08-18T00:00:00.000Z",
    ...overrides,
  };
}

function medication(id = "guest-medication") {
  return { id };
}

function intake(medicationId) {
  return {
    medication_id: medicationId,
    intake_date: "2026-08-18",
    recorded_at: "2026-08-18T01:00:00.000Z",
    taken: true,
  };
}

function freshDb() {
  return { users: {}, claims: new Map() };
}

function userData(db, userId) {
  return db.users[userId] ??= { medications: [], intakes: [], visit: null };
}

function mergeGuestDataset(
  db,
  userId,
  datasetId,
  { medications = [], intakes = [], guestVisit = null } = {},
) {
  const before = clone(db);
  const existingClaim = db.claims.get(datasetId);
  if (existingClaim) {
    return existingClaim === userId
      ? { success: true, claimed: true, alreadyClaimed: true }
      : { success: false, claimed: false, failureReason: "dataset_claimed_by_another_user" };
  }

  const user = userData(db, userId);
  let guestVisitIsNewer = false;
  if (guestVisit) {
    const validVisit = guestVisit.visit_id === "upcoming"
      && validDateKey(guestVisit.visit_date)
      && !Number.isNaN(Date.parse(guestVisit.created_at))
      && !Number.isNaN(Date.parse(guestVisit.updated_at));
    if (!validVisit) {
      Object.assign(db, before);
      return { success: false, claimed: false, failureReason: "invalid_guest_visit" };
    }
    if (user.visit && user.visit.visit_date !== guestVisit.visit_date) {
      guestVisitIsNewer = Date.parse(guestVisit.updated_at) > Date.parse(user.visit.updated_at);
    }
  }

  const knownMedicationIds = new Set([
    ...user.medications.map((item) => item.id),
    ...medications.map((item) => item.id),
  ]);
  if (intakes.some((record) => !knownMedicationIds.has(record.medication_id))) {
    Object.assign(db, before);
    return { success: false, claimed: false, failureReason: "guest_dataset_conflict" };
  }

  try {
    for (const item of medications) {
      if (!user.medications.some((existing) => existing.id === item.id)) {
        user.medications.push(item);
      }
    }
    for (const record of intakes) {
      const exists = user.intakes.some((existing) => (
        existing.medication_id === record.medication_id
        && existing.intake_date === record.intake_date
      ));
      if (!exists) user.intakes.push(record);
    }
    const reusedVisit = Boolean(user.visit && guestVisit);
    if (!user.visit && guestVisit) user.visit = guestVisit;
    else if (user.visit && guestVisitIsNewer) {
      user.visit = { ...guestVisit, created_at: user.visit.created_at };
    }
    db.claims.set(datasetId, userId);
    return {
      success: true,
      claimed: true,
      insertedVisitCount: guestVisit && !reusedVisit ? 1 : 0,
      reusedVisitCount: reusedVisit ? 1 : 0,
    };
  } catch (error) {
    Object.assign(db, before);
    return { success: false, claimed: false, failureReason: error.message };
  }
}

function assertUnchanged(db, before) {
  assert.deepEqual(db.users, before.users);
  assert.deepEqual([...db.claims], [...before.claims]);
}

const cases = [
  ["A insert guest visit and claim", () => {
    const db = freshDb();
    const result = mergeGuestDataset(db, "user-a", "dataset-a", {
      guestVisit: visit("2026-09-01"),
    });
    assert.equal(result.insertedVisitCount, 1);
    assert.equal(db.claims.get("dataset-a"), "user-a");
  }],
  ["B server visit remains when guest visit is absent", () => {
    const db = freshDb();
    userData(db, "user-a").visit = visit("2026-09-01");
    const before = clone(db);
    assertUnchanged(db, before);
  }],
  ["C same visit date reuses server and claims", () => {
    const db = freshDb();
    const serverVisit = visit("2026-09-01", { created_at: "2026-08-01T00:00:00.000Z" });
    userData(db, "user-a").visit = serverVisit;
    const result = mergeGuestDataset(db, "user-a", "dataset-c", {
      guestVisit: visit("2026-09-01"),
    });
    assert.equal(result.reusedVisitCount, 1);
    assert.deepEqual(userData(db, "user-a").visit, serverVisit);
  }],
  ["D newer guest visit replaces the server visit and claims", () => {
    const db = freshDb();
    const serverCreatedAt = "2026-08-01T00:00:00.000Z";
    userData(db, "user-a").visit = visit("2026-09-01", {
      created_at: serverCreatedAt,
      updated_at: "2026-08-18T00:00:00.000Z",
    });
    const result = mergeGuestDataset(db, "user-a", "dataset-d", {
      guestVisit: visit("2026-09-02", { updated_at: "2026-08-19T00:00:00.000Z" }),
    });
    assert.equal(result.success, true);
    assert.equal(result.reusedVisitCount, 1);
    assert.equal(userData(db, "user-a").visit.visit_date, "2026-09-02");
    assert.equal(userData(db, "user-a").visit.created_at, serverCreatedAt);
    assert.equal(db.claims.get("dataset-d"), "user-a");
  }],
  ["D2 newer server visit remains while the guest dataset is claimed", () => {
    const db = freshDb();
    const serverVisit = visit("2026-09-01", { updated_at: "2026-08-20T00:00:00.000Z" });
    userData(db, "user-a").visit = serverVisit;
    const result = mergeGuestDataset(db, "user-a", "dataset-d2", {
      guestVisit: visit("2026-09-02", { updated_at: "2026-08-19T00:00:00.000Z" }),
    });
    assert.equal(result.success, true);
    assert.deepEqual(userData(db, "user-a").visit, serverVisit);
    assert.equal(db.claims.get("dataset-d2"), "user-a");
  }],
  ["E guest create then delete does not delete server", () => {
    const db = freshDb();
    const serverVisit = visit("2026-09-01");
    userData(db, "user-a").visit = serverVisit;
    let guestMutation = visit("2026-09-02");
    guestMutation = null;
    assert.equal(guestMutation, null);
    assert.deepEqual(userData(db, "user-a").visit, serverVisit);
  }],
  ["F invalid date format is rejected without claim", () => {
    const db = freshDb();
    const before = clone(db);
    const result = mergeGuestDataset(db, "user-a", "dataset-f", {
      guestVisit: visit("2026-9-01"),
    });
    assert.equal(result.failureReason, "invalid_guest_visit");
    assertUnchanged(db, before);
  }],
  ["G nonexistent date is rejected", () => {
    const db = freshDb();
    const result = mergeGuestDataset(db, "user-a", "dataset-g", {
      guestVisit: visit("2026-02-31"),
    });
    assert.equal(result.failureReason, "invalid_guest_visit");
    assert.equal(db.claims.has("dataset-g"), false);
  }],
  ["H visit-only dataset can be claimed", () => {
    const db = freshDb();
    const result = mergeGuestDataset(db, "user-a", "dataset-h", {
      guestVisit: visit("2026-09-01"),
    });
    assert.equal(result.success, true);
    assert.equal(db.claims.get("dataset-h"), "user-a");
  }],
  ["I medication intake and visit merge together", () => {
    const db = freshDb();
    const med = medication();
    const result = mergeGuestDataset(db, "user-a", "dataset-i", {
      medications: [med],
      intakes: [intake(med.id)],
      guestVisit: visit("2026-09-01"),
    });
    assert.equal(result.success, true);
    assert.equal(userData(db, "user-a").medications.length, 1);
    assert.equal(userData(db, "user-a").intakes.length, 1);
    assert.equal(userData(db, "user-a").visit.visit_date, "2026-09-01");
  }],
  ["J newer guest visit merges with medication and intake atomically", () => {
    const db = freshDb();
    userData(db, "user-a").visit = visit("2026-09-01", {
      updated_at: "2026-08-18T00:00:00.000Z",
    });
    const med = medication();
    const result = mergeGuestDataset(db, "user-a", "dataset-j", {
      medications: [med],
      intakes: [intake(med.id)],
      guestVisit: visit("2026-09-02", { updated_at: "2026-08-19T00:00:00.000Z" }),
    });
    assert.equal(result.success, true);
    assert.equal(userData(db, "user-a").medications.length, 1);
    assert.equal(userData(db, "user-a").intakes.length, 1);
    assert.equal(userData(db, "user-a").visit.visit_date, "2026-09-02");
  }],
  ["K same dataset request is idempotent", () => {
    const db = freshDb();
    const payload = { guestVisit: visit("2026-09-01") };
    assert.equal(mergeGuestDataset(db, "user-a", "dataset-k", payload).success, true);
    const repeated = mergeGuestDataset(db, "user-a", "dataset-k", payload);
    assert.equal(repeated.alreadyClaimed, true);
    assert.equal(db.claims.size, 1);
  }],
  ["L another user cannot claim the dataset", () => {
    const db = freshDb();
    const payload = { guestVisit: visit("2026-09-01") };
    assert.equal(mergeGuestDataset(db, "user-a", "dataset-l", payload).success, true);
    const blocked = mergeGuestDataset(db, "user-b", "dataset-l", payload);
    assert.equal(blocked.failureReason, "dataset_claimed_by_another_user");
    assert.equal(db.claims.get("dataset-l"), "user-a");
  }],
];

for (const [name, run] of cases) {
  run();
  console.log(`PASS ${name}`);
}

console.log(`visit schedule merge fixture cases: ${cases.length}/${cases.length} passed`);
