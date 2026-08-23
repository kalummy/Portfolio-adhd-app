import assert from "node:assert/strict";

function med(overrides = {}) {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    catalog_id: overrides.catalog_id ?? null,
    name: overrides.name ?? "Concerta",
    ingredient_name: overrides.ingredient_name ?? "methylphenidate",
    strength_value: overrides.strength_value ?? 36,
    strength_unit: "mg",
    manufacturer: overrides.manufacturer ?? "Janssen",
    image_path: "/medications/concerta-36.png",
    registration_method: overrides.registration_method ?? "search",
    schedule: overrides.schedule ?? "daily",
    scheduled_time: overrides.scheduled_time ?? null,
    active: overrides.active ?? true,
    created_at: overrides.created_at ?? "2026-08-18T00:00:00.000Z",
    ...overrides,
  };
}

function intake(medicationId, date = "2026-08-18") {
  return {
    medication_id: medicationId,
    intake_date: date,
    recorded_at: `${date}T01:00:00.000Z`,
    taken: true,
  };
}

function clone(value) {
  return structuredClone(value);
}

function coreMatches(left, right) {
  return left.catalog_id === right.catalog_id
    && left.name === right.name
    && left.ingredient_name === right.ingredient_name
    && left.strength_value === right.strength_value
    && left.strength_unit === right.strength_unit
    && left.manufacturer === right.manufacturer
    && left.schedule === right.schedule
    && left.scheduled_time === right.scheduled_time;
}

function validIntake(record) {
  return record.taken === true
    && /^\d{4}-\d{2}-\d{2}$/.test(record.intake_date)
    && !Number.isNaN(Date.parse(record.recorded_at));
}

function mergeGuestDataset(db, userId, datasetId, medications, intakes) {
  const original = clone(db);
  const user = db.users[userId] ??= { medications: [], intakes: [], claims: new Map() };
  const existingClaim = db.claims.get(datasetId);
  const conflicts = [];
  const mapping = new Map();
  const newMedications = [];
  let reusedMedicationCount = 0;

  if (existingClaim) {
    return existingClaim === userId
      ? { success: true, claimed: true, alreadyClaimed: true }
      : { success: false, claimed: false, failureReason: "dataset_claimed_by_another_user" };
  }

  for (const guest of medications) {
    const sameId = user.medications.find((server) => server.id === guest.id);
    if (sameId) {
      if (!coreMatches(sameId, guest)) {
        conflicts.push({ code: "same_id_medication_conflict" });
      } else {
        mapping.set(guest.id, sameId.id);
        reusedMedicationCount += 1;
      }
      continue;
    }

    const safeCandidates = guest.catalog_id
      ? user.medications.filter((server) => (
          server.id !== guest.id
          && server.active === true
          && server.catalog_id === guest.catalog_id
          && coreMatches(server, guest)
        ))
      : [];

    if (safeCandidates.length === 1) {
      mapping.set(guest.id, safeCandidates[0].id);
      reusedMedicationCount += 1;
    } else if (safeCandidates.length > 1) {
      conflicts.push({ code: "ambiguous_catalog_medication_match" });
    } else {
      mapping.set(guest.id, guest.id);
      newMedications.push(guest);
    }
  }

  const mappedIntakes = [];
  for (const record of intakes) {
    if (record.taken !== true) continue;
    if (!validIntake(record)) {
      conflicts.push({ code: "invalid_guest_intake" });
      continue;
    }
    const serverMedicationId = mapping.get(record.medication_id);
    if (!serverMedicationId) {
      conflicts.push({ code: "missing_medication_mapping" });
      continue;
    }
    mappedIntakes.push({ ...record, medication_id: serverMedicationId });
  }

  if (conflicts.length > 0) {
    Object.assign(db, original);
    return { success: false, claimed: false, conflicts, failureReason: "guest_dataset_conflict" };
  }

  let insertedIntakeCount = 0;
  let existingIntakeCount = 0;
  try {
    user.medications.push(...newMedications);
    if (newMedications.some((record) => record.force_constraint_error)) {
      throw new Error("simulated_constraint_error");
    }
    for (const record of mappedIntakes) {
      const exists = user.intakes.some((server) => (
        server.medication_id === record.medication_id
        && server.intake_date === record.intake_date
      ));
      if (exists) {
        existingIntakeCount += 1;
      } else {
        user.intakes.push(record);
        insertedIntakeCount += 1;
      }
    }
    db.claims.set(datasetId, userId);
  } catch (error) {
    Object.assign(db, original);
    return {
      success: false,
      claimed: false,
      conflicts: [],
      failureReason: error.message,
    };
  }

  return {
    success: true,
    claimed: true,
    insertedMedicationCount: newMedications.length,
    reusedMedicationCount,
    insertedIntakeCount,
    existingIntakeCount,
    conflicts: [],
  };
}

function freshDb() {
  return { users: {}, claims: new Map() };
}

function assertRollback(db, before) {
  assert.deepEqual(db.users, before.users);
  assert.deepEqual([...db.claims.entries()], [...before.claims.entries()]);
}

const cases = [];

cases.push(["A new user creates all", () => {
  const db = freshDb();
  const a = med({ id: "guest-a", catalog_id: "cat-a" });
  const b = med({ id: "guest-b", catalog_id: "cat-b", name: "Atomoxetine" });
  const result = mergeGuestDataset(db, "user-a", "dataset-a", [a, b], [intake(a.id), intake(b.id, "2026-08-19")]);
  assert.equal(result.success, true);
  assert.equal(result.insertedMedicationCount, 2);
  assert.equal(result.insertedIntakeCount, 2);
}]);

cases.push(["B existing user keeps server and adds guest", () => {
  const db = freshDb();
  db.users["user-a"] = { medications: [med({ id: "server-a", catalog_id: "cat-a" })], intakes: [], claims: new Map() };
  const guest = med({ id: "guest-b", catalog_id: "cat-b" });
  const result = mergeGuestDataset(db, "user-a", "dataset-b", [guest], [intake(guest.id)]);
  assert.equal(result.insertedMedicationCount, 1);
  assert.equal(db.users["user-a"].medications.some((item) => item.id === "server-a"), true);
}]);

cases.push(["C same id same core reuses server", () => {
  const db = freshDb();
  const same = med({ id: "same", catalog_id: "cat-a" });
  db.users["user-a"] = { medications: [same], intakes: [], claims: new Map() };
  const result = mergeGuestDataset(db, "user-a", "dataset-c", [clone(same)], [intake("same")]);
  assert.equal(result.reusedMedicationCount, 1);
  assert.equal(result.insertedMedicationCount, 0);
}]);

cases.push(["D same id conflict rolls back", () => {
  const db = freshDb();
  db.users["user-a"] = { medications: [med({ id: "same", catalog_id: "cat-a" })], intakes: [], claims: new Map() };
  const before = clone(db);
  const result = mergeGuestDataset(db, "user-a", "dataset-d", [med({ id: "same", catalog_id: "cat-a", strength_value: 54 })], []);
  assert.equal(result.success, false);
  assertRollback(db, before);
}]);

cases.push(["E unique same catalog maps to server", () => {
  const db = freshDb();
  const server = med({ id: "server", catalog_id: "cat-a" });
  db.users["user-a"] = { medications: [server], intakes: [], claims: new Map() };
  const guest = med({ id: "guest", catalog_id: "cat-a" });
  const result = mergeGuestDataset(db, "user-a", "dataset-e", [guest], [intake("guest")]);
  assert.equal(result.reusedMedicationCount, 1);
  assert.equal(db.users["user-a"].intakes[0].medication_id, "server");
}]);

cases.push(["F multiple same catalog candidates conflict", () => {
  const db = freshDb();
  db.users["user-a"] = {
    medications: [med({ id: "server-a", catalog_id: "cat-a" }), med({ id: "server-b", catalog_id: "cat-a" })],
    intakes: [],
    claims: new Map(),
  };
  const before = clone(db);
  const result = mergeGuestDataset(db, "user-a", "dataset-f", [med({ id: "guest", catalog_id: "cat-a" })], []);
  assert.equal(result.success, false);
  assertRollback(db, before);
}]);

cases.push(["G manual no catalog same name inserts separately", () => {
  const db = freshDb();
  db.users["user-a"] = { medications: [med({ id: "server", catalog_id: null, registration_method: "manual" })], intakes: [], claims: new Map() };
  const result = mergeGuestDataset(db, "user-a", "dataset-g", [med({ id: "guest", catalog_id: null, registration_method: "manual" })], []);
  assert.equal(result.insertedMedicationCount, 1);
}]);

cases.push(["H existing intake PK is preserved", () => {
  const db = freshDb();
  const server = med({ id: "same", catalog_id: "cat-a" });
  db.users["user-a"] = { medications: [server], intakes: [intake("same")], claims: new Map() };
  const result = mergeGuestDataset(db, "user-a", "dataset-h", [clone(server)], [intake("same")]);
  assert.equal(result.existingIntakeCount, 1);
  assert.equal(db.users["user-a"].intakes.length, 1);
}]);

cases.push(["I missing intake mapping prevents claim", () => {
  const db = freshDb();
  const before = clone(db);
  const result = mergeGuestDataset(db, "user-a", "dataset-i", [], [intake("missing")]);
  assert.equal(result.success, false);
  assertRollback(db, before);
}]);

cases.push(["J dataset can be claimed by only one user", () => {
  const db = freshDb();
  const guest = med({ id: "guest", catalog_id: "cat-a" });
  assert.equal(mergeGuestDataset(db, "user-a", "dataset-j", [guest], []).success, true);
  assert.equal(mergeGuestDataset(db, "user-b", "dataset-j", [guest], []).success, false);
}]);

cases.push(["K repeated same-user request does not duplicate", () => {
  const db = freshDb();
  const guest = med({ id: "guest", catalog_id: "cat-a" });
  assert.equal(mergeGuestDataset(db, "user-a", "dataset-k", [guest], [intake("guest")]).success, true);
  const result = mergeGuestDataset(db, "user-a", "dataset-k", [guest], [intake("guest")]);
  assert.equal(result.alreadyClaimed, true);
  assert.equal(db.users["user-a"].medications.length, 1);
  assert.equal(db.users["user-a"].intakes.length, 1);
}]);

cases.push(["L simulated constraint error rolls back", () => {
  const db = freshDb();
  const bad = med({ id: "bad", catalog_id: "cat-a", force_constraint_error: true });
  const before = clone(db);
  const result = mergeGuestDataset(db, "user-a", "dataset-l", [bad], [intake("bad")]);
  assert.equal(result.success, false);
  assert.equal(result.failureReason, "simulated_constraint_error");
  assertRollback(db, before);
}]);

cases.push(["M scheduled time is preserved for a new guest medication", () => {
  const db = freshDb();
  const guest = med({ id: "guest-time", catalog_id: "cat-time", scheduled_time: "13:05" });
  const result = mergeGuestDataset(db, "user-a", "dataset-m", [guest], []);
  assert.equal(result.success, true);
  assert.equal(db.users["user-a"].medications[0].scheduled_time, "13:05");
}]);

cases.push(["N different scheduled time is not reused as the same medication", () => {
  const db = freshDb();
  const server = med({ id: "server-time", catalog_id: "cat-time", scheduled_time: "09:00" });
  db.users["user-a"] = { medications: [server], intakes: [], claims: new Map() };
  const guest = med({ id: "guest-time", catalog_id: "cat-time", scheduled_time: "13:00" });
  const result = mergeGuestDataset(db, "user-a", "dataset-n", [guest], []);
  assert.equal(result.reusedMedicationCount, 0);
  assert.equal(result.insertedMedicationCount, 1);
}]);

for (const [name, run] of cases) {
  run();
  console.log(`PASS ${name}`);
}

console.log(`guest dataset merge fixture cases: ${cases.length}/${cases.length} passed`);
