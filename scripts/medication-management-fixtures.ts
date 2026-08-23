import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
// @ts-expect-error Node's type-stripping fixture runner imports production TypeScript directly.
import { formatScheduledTimeLabel, normalizeHourInput, parseScheduledTime, resolveMedicationEditorInitialTime, toScheduledTime } from "../lib/medication-time.ts";
// @ts-expect-error Node's type-stripping fixture runner imports production TypeScript directly.
import { isValidDateKey, KST_TIME_ZONE } from "../lib/kst-date.ts";
// @ts-expect-error Node's type-stripping fixture runner imports production TypeScript directly.
import { fromSupabaseMedication, toSupabaseMedicationMigrationInput } from "../lib/repositories/medications/mapper.ts";
// @ts-expect-error Node's type-stripping fixture runner imports production TypeScript directly.
import { reconcileMedicationIntakeRecord } from "../lib/medication-intake-state.ts";

const fixtureMedicationId = "fixture-medication";
const todayDateKey = "2026-08-23";
const fixtureMedication = {
  id: fixtureMedicationId,
  name: "테스트약",
  strengthValue: 10,
  strengthUnit: "mg" as const,
  imagePath: "/icons/medication-fallback-64.svg",
  registrationMethod: "search" as const,
  schedule: "daily" as const,
  createdAt: "2026-08-23T00:00:00.000Z",
  active: true,
};
const latestTakenIntake = {
  id: `${todayDateKey}:${fixtureMedicationId}`,
  medicationId: fixtureMedicationId,
  date: todayDateKey,
  taken: true,
  recordedAt: "2026-08-23T01:30:00.000Z",
};

function resolveEditorFields(
  scheduledTime: string | null | undefined,
  intakeRecords: Parameters<typeof resolveMedicationEditorInitialTime>[1],
  targetDateKey = todayDateKey,
) {
  return resolveMedicationEditorInitialTime(
    { ...fixtureMedication, scheduledTime },
    intakeRecords,
    {
      todayDateKey: targetDateKey,
      timeZone: KST_TIME_ZONE,
      isValidDateKey,
    },
  );
}

// CASE 1: A saved scheduled time always wins over a newer intake time.
assert.deepEqual(resolveEditorFields("09:30", [latestTakenIntake]), {
  period: "am",
  hour: "9",
  minute: "30",
});
// CASE 2: A new medication with null scheduledTime uses its latest intake.
assert.deepEqual(resolveEditorFields(null, [latestTakenIntake]), {
  period: "am",
  hour: "10",
  minute: "30",
});
// CASE 3: Missing scheduledTime follows the same fallback path as null.
assert.deepEqual(resolveEditorFields(undefined, [latestTakenIntake]), {
  period: "am",
  hour: "10",
  minute: "30",
});
// CASE 4: With neither source, the editor stays empty.
assert.equal(resolveEditorFields(null, []), null);
// CASE 5: Select the latest taken intake, ignoring a later untaken record.
assert.deepEqual(resolveEditorFields(null, [
  {
    ...latestTakenIntake,
    id: "past-intake",
    date: "2026-08-22",
    recordedAt: "2026-08-22T00:10:00.000Z",
  },
  latestTakenIntake,
  {
    ...latestTakenIntake,
    id: "untaken-intake",
    taken: false,
    recordedAt: "2026-08-23T02:00:00.000Z",
  },
]), { period: "am", hour: "10", minute: "30" });
// CASE 6: An intake for a different saved medication must not be used.
assert.equal(resolveEditorFields(null, [{
  ...latestTakenIntake,
  id: "other-medication-intake",
  medicationId: "other-medication",
}]), null);
// CASE 7: A future intake must not become the initial suggestion.
assert.equal(resolveEditorFields(null, [{
  ...latestTakenIntake,
  id: "future-intake",
  date: "2026-08-24",
  recordedAt: "2026-08-24T01:30:00.000Z",
}]), null);
// CASE 8: A later-date intake must not leak into an earlier selected-date editor.
assert.equal(resolveEditorFields(null, [latestTakenIntake], "2026-08-22"), null);
assert.deepEqual(resolveEditorFields(null, [
  {
    ...latestTakenIntake,
    id: "selected-date-intake",
    date: "2026-08-22",
    recordedAt: "2026-08-22T07:40:00.000Z",
  },
  latestTakenIntake,
], "2026-08-22"), { period: "pm", hour: "4", minute: "40" });
// A cancelled intake is not an editor fallback source.
assert.equal(resolveEditorFields(null, [{
  ...latestTakenIntake,
  taken: false,
}]), null);

const cancelledRecords = reconcileMedicationIntakeRecord([
  latestTakenIntake,
  { ...latestTakenIntake, id: "legacy-duplicate" },
  { ...latestTakenIntake, id: "other-date", date: "2026-08-22" },
  { ...latestTakenIntake, id: "other-medication", medicationId: "other-medication" },
], fixtureMedicationId, todayDateKey, null);
assert.deepEqual(
  cancelledRecords.map((record) => record.id),
  ["other-date", "other-medication"],
  "Cancellation removes every same-medication same-date record and preserves unrelated intake history",
);

assert.deepEqual(parseScheduledTime("00:30"), { period: "am", hour: "12", minute: "30" });
assert.deepEqual(parseScheduledTime("09:05"), { period: "am", hour: "9", minute: "05" });
assert.deepEqual(parseScheduledTime("12:00"), { period: "pm", hour: "12", minute: "00" });
assert.deepEqual(parseScheduledTime("13:10"), { period: "pm", hour: "1", minute: "10" });
assert.deepEqual(parseScheduledTime("23:59"), { period: "pm", hour: "11", minute: "59" });
assert.equal(parseScheduledTime("24:00"), null);
assert.equal(formatScheduledTimeLabel("09:30"), "오전 9:30");
assert.equal(formatScheduledTimeLabel("13:30"), "오후 1:30");
assert.equal(formatScheduledTimeLabel(null), null);

assert.deepEqual(normalizeHourInput("00", "pm"), { period: "am", hour: "12" });
assert.deepEqual(normalizeHourInput("0", "pm"), { period: "am", hour: "0" });
assert.deepEqual(normalizeHourInput("09", "pm"), { period: "am", hour: "9" });
assert.deepEqual(normalizeHourInput("12", "am"), { period: "pm", hour: "12" });
assert.deepEqual(normalizeHourInput("13", "am"), { period: "pm", hour: "1" });
assert.deepEqual(normalizeHourInput("23", "am"), { period: "pm", hour: "11" });
assert.deepEqual(normalizeHourInput("25", "am"), { period: "am", hour: "25" });

assert.equal(toScheduledTime({ period: "am", hour: "", minute: "" }), null);
assert.equal(toScheduledTime({ period: "am", hour: "9", minute: "" }), undefined);
assert.equal(toScheduledTime({ period: "am", hour: "9", minute: "60" }), undefined);
assert.equal(toScheduledTime({ period: "am", hour: "12", minute: "0" }), "00:00");
assert.equal(toScheduledTime({ period: "pm", hour: "12", minute: "0" }), "12:00");
assert.equal(toScheduledTime({ period: "pm", hour: "1", minute: "5" }), "13:05");

const migrationInput = toSupabaseMedicationMigrationInput({
  id: "fixture-medication",
  name: "테스트약",
  strengthValue: 10,
  strengthUnit: "mg",
  imagePath: "/icons/medication-fallback-64.svg",
  registrationMethod: "search",
  schedule: "daily",
  scheduledTime: "13:05",
  createdAt: "2026-08-23T00:00:00.000Z",
});
assert.equal(migrationInput.scheduled_time, "13:05");
assert.equal(fromSupabaseMedication({
  ...migrationInput,
  user_id: "fixture-user",
  scheduled_time: "13:05:00",
}).scheduledTime, "13:05");

const migration = await readFile(
  new URL(
    "../supabase/migrations/20260823043651_add_medication_scheduled_time.sql",
    import.meta.url,
  ),
  "utf8",
);
assert.match(migration, /add column scheduled_time time without time zone/);
assert.match(migration, /create or replace function public\.migrate_initial_user_medications/);
assert.match(migration, /create or replace function public\.merge_guest_medication_dataset/);
assert.match(
  migration,
  /v_existing_medication\.scheduled_time is not distinct from v_medication\.scheduled_time/,
);
assert.doesNotMatch(migration, /for update;/i);
assert.doesNotMatch(migration, /pg_catalog\.coalesce/);

const indexedDb = await readFile(new URL("../lib/indexed-db.ts", import.meta.url), "utf8");
assert.match(indexedDb, /const DB_VERSION = 7/);
assert.match(indexedDb, /updateSavedMedicationSchedule/);

const listPage = await readFile(new URL("../app/medications/page.tsx", import.meta.url), "utf8");
assert.match(listPage, /이미 저장된 복용기록은 지워지지 않아요\./);
assert.match(listPage, /삭제하면 다시 약을 등록해야해요\./);
assert.match(listPage, /\/medications\/new\/search\?origin=medications/);

const scheduleEditor = await readFile(
  new URL("../components/medication-schedule-editor.tsx", import.meta.url),
  "utf8",
);
assert.match(scheduleEditor, /medicationIntakes\.listAll\(\)/);
assert.match(scheduleEditor, /resolveMedicationEditorInitialTime/);
assert.match(scheduleEditor, /targetDateKey/);
assert.match(scheduleEditor, /originalTime\.current = savedMedication\.scheduledTime \?\? null/);

const schedulePage = await readFile(
  new URL("../app/medications/[medicationId]/schedule/page.tsx", import.meta.url),
  "utf8",
);
assert.match(schedulePage, /targetDateKey={targetDateKey}/);

const initialTime = await readFile(
  new URL("../lib/medication-editor-initial-time.ts", import.meta.url),
  "utf8",
);
assert.match(initialTime, /timeZone: KST_TIME_ZONE/);
assert.match(initialTime, /isValidDateKey/);

const homeScreen = await readFile(
  new URL("../components/home-screen.tsx", import.meta.url),
  "utf8",
);
assert.match(homeScreen, /CONSUMED_TOAST_SESSION_PREFIX/);
assert.match(homeScreen, /window\.sessionStorage\.setItem\(consumptionKey, "1"\)/);
assert.match(homeScreen, /url\.searchParams\.delete\("toastId"\)/);
assert.match(homeScreen, /window\.history\.replaceState\(window\.history\.state, "", nextUrl\)/);
assert.match(homeScreen, /formatMedicationRecordTime\(intake\.recordedAt\)/);
assert.match(homeScreen, /reconcileMedicationIntakeRecord/);
assert.doesNotMatch(homeScreen, /scheduledTimeLabel \?\?/);

const supabaseIntakes = await readFile(
  new URL("../lib/repositories/intake-records/supabase.ts", import.meta.url),
  "utf8",
);
assert.match(supabaseIntakes, /\.delete\(\)[\s\S]*\.select\(INTAKE_COLUMNS\)/);
assert.match(supabaseIntakes, /await findByMedicationAndDate\(medicationId, date\)/);

const registrationSchedule = await readFile(
  new URL("../app/medications/new/schedule/page.tsx", import.meta.url),
  "utf8",
);
assert.match(registrationSchedule, /const toastId = createClientId\(\)/);
assert.match(registrationSchedule, /medicationToast=added&toastId=/);

console.log("PASS medication management fixtures");
