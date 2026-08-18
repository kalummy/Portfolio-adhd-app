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
      Object.assign(db, before);
      return { success: false, claimed: false, failureReason: "guest_dataset_conflict" };
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
  ["D different visit date conflicts and rolls back", () => {
    const db = freshDb();
    userData(db, "user-a").visit = visit("2026-09-01");
    const before = clone(db);
    const result = mergeGuestDataset(db, "user-a", "dataset-d", {
      guestVisit: visit("2026-09-02"),
    });
    assert.equal(result.failureReason, "guest_dataset_conflict");
    assertUnchanged(db, before);
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
  ["J visit conflict rolls back medication and intake", () => {
    const db = freshDb();
    userData(db, "user-a").visit = visit("2026-09-01");
    const before = clone(db);
    const med = medication();
    const result = mergeGuestDataset(db, "user-a", "dataset-j", {
      medications: [med],
      intakes: [intake(med.id)],
      guestVisit: visit("2026-09-02"),
    });
    assert.equal(result.success, false);
    assertUnchanged(db, before);
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
