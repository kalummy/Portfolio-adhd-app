import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
// @ts-expect-error Node's type-stripping fixture runner imports production TypeScript directly.
import { formatScheduledTimeLabel, normalizeHourInput, parseScheduledTime, resolveMedicationEditorInitialTime, toRecordedAtIso, toScheduledTime } from "../lib/medication-time.ts";
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
  recordedAt: "2026-08-23T11:01:00.000Z",
};

function resolveEditorFields(
  intakeRecords: Parameters<typeof resolveMedicationEditorInitialTime>[1],
  targetDateKey = todayDateKey,
  medicationId = fixtureMedicationId,
) {
  return resolveMedicationEditorInitialTime(
    medicationId,
    intakeRecords,
    {
      targetDateKey,
      timeZone: KST_TIME_ZONE,
      isValidDateKey,
    },
  );
}

// CASE 1: The editor initializes from the exact intake's KST recordedAt.
assert.deepEqual(resolveEditorFields([latestTakenIntake]), {
  period: "pm",
  hour: "8",
  minute: "01",
});
// CASE 2: The selected KST time converts deterministically to UTC ISO.
assert.equal(
  toRecordedAtIso(todayDateKey, { period: "am", hour: "8", minute: "01" }),
  "2026-08-22T23:01:00.000Z",
);
// CASE 3: Re-entering after the update returns the new KST fields.
const updatedTakenIntake = {
  ...latestTakenIntake,
  recordedAt: "2026-08-22T23:01:00.000Z",
};
assert.deepEqual(resolveEditorFields([updatedTakenIntake]), {
  period: "am",
  hour: "8",
  minute: "01",
});
// CASE 4: With no taken intake for the target date, the editor has no initial value.
assert.equal(resolveEditorFields([]), null);
assert.equal(resolveEditorFields([{ ...latestTakenIntake, taken: false }]), null);
// CASE 5: Another date's intake must never leak into the target date.
assert.equal(resolveEditorFields([{
  ...latestTakenIntake,
  id: "other-date-intake",
  date: "2026-08-22",
}]), null);
// CASE 6: Another medication's same-date intake must never be used.
assert.equal(resolveEditorFields([{
  ...latestTakenIntake,
  id: "other-medication-intake",
  medicationId: "other-medication",
}]), null);
// Exactly one record is required; ambiguous legacy duplicates are rejected.
assert.equal(resolveEditorFields([
  latestTakenIntake,
  { ...latestTakenIntake, id: "legacy-duplicate" },
]), null);
const august20Intake = {
  ...latestTakenIntake,
  id: "august-20-intake",
  date: "2026-08-20",
  recordedAt: "2026-08-20T01:30:00.000Z",
};
const august21Intake = {
  ...latestTakenIntake,
  id: "august-21-intake",
  date: "2026-08-21",
  recordedAt: "2026-08-21T05:25:00.000Z",
};

// CASE 5 continued: An earlier taken intake must not leak into the selected date.
assert.equal(resolveEditorFields([august20Intake], "2026-08-21"), null);
// The selected date's taken intake provides the initial value.
assert.deepEqual(
  resolveEditorFields([august21Intake], "2026-08-21"),
  { period: "pm", hour: "2", minute: "25" },
);
// Only the selected date is used when multiple dates exist.
assert.deepEqual(
  resolveEditorFields([august20Intake, august21Intake], "2026-08-21"),
  { period: "pm", hour: "2", minute: "25" },
);
// A later-date intake must not leak into an earlier selected date.
assert.equal(resolveEditorFields([{
  ...august21Intake,
  id: "august-22-intake",
  date: "2026-08-22",
  recordedAt: "2026-08-22T05:25:00.000Z",
}], "2026-08-21"), null);

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
assert.equal(toRecordedAtIso("2026-08-23", { period: "pm", hour: "8", minute: "01" }), "2026-08-23T11:01:00.000Z");
assert.equal(toRecordedAtIso("2026-02-30", { period: "am", hour: "8", minute: "01" }), undefined);
assert.equal(toRecordedAtIso("2026-08-23", { period: "am", hour: "", minute: "" }), undefined);

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
const guestUpdateStart = indexedDb.indexOf("export async function updateMedicationIntakeRecordedAt(");
const guestUpdateEnd = indexedDb.indexOf("export async function reserveGuestMedicationDatasetForUser(");
assert.notEqual(guestUpdateStart, -1);
assert.notEqual(guestUpdateEnd, -1);
const guestUpdateSource = indexedDb.slice(guestUpdateStart, guestUpdateEnd);
assert.match(guestUpdateSource, /activeRecordIds\.has\(record\.id\)/);
assert.match(guestUpdateSource, /record\.medicationId === medicationId/);
assert.match(guestUpdateSource, /record\.date === date/);
assert.match(guestUpdateSource, /record\.taken === true/);
assert.match(guestUpdateSource, /updatedRecord = \{ \.\.\.matches\[0\], recordedAt \}/);
assert.match(guestUpdateSource, /store\.put\(updatedRecord\)/);
assert.match(guestUpdateSource, /transaction\(INTAKE_DATASET_STORE, "readonly"\)/);
assert.doesNotMatch(guestUpdateSource, /metadataStore\.put|intakeRecordIds:/);

const listPage = await readFile(new URL("../app/medications/page.tsx", import.meta.url), "utf8");
assert.match(listPage, /이미 저장된 복용기록은 지워지지 않아요\./);
assert.match(listPage, /삭제하면 다시 약을 등록해야해요\./);
assert.match(listPage, /\/medications\/new\/search\?origin=medications/);
assert.match(listPage, /\{intake \? \([\s\S]*?복용 시간 수정[\s\S]*?\) : null\}/);

const scheduleEditor = await readFile(
  new URL("../components/medication-schedule-editor.tsx", import.meta.url),
  "utf8",
);
assert.match(scheduleEditor, /medicationIntakes\.listByDate\(targetDateKey\)/);
assert.match(scheduleEditor, /resolveMedicationEditorInitialTime/);
assert.match(scheduleEditor, /targetDateKey/);
assert.match(scheduleEditor, /repository\.updateRecordedAt\([\s\S]*?repository\.listByDate\(targetDateKey\)/);
assert.match(scheduleEditor, /savedRecord\.id !== intake\.id/);
assert.match(scheduleEditor, /savedRecord\.recordedAt !== recordedAt/);
assert.match(scheduleEditor, /persistedRecord\?\.id !== intake\.id/);
assert.doesNotMatch(scheduleEditor, /scheduledTime|updateSchedule|trackMedicationScheduleUpdated/);
assert.equal((scheduleEditor.match(/updateRecordedAt\(/g) ?? []).length, 1);
const completeHandlerIndex = scheduleEditor.indexOf("async function complete()");
assert.ok(completeHandlerIndex >= 0);
assert.ok(scheduleEditor.indexOf("updateRecordedAt(") > completeHandlerIndex);

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
assert.doesNotMatch(initialTime, /scheduledTime|getKstDateKey/);

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

const homePage = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
assert.match(homePage, /medicationToast === "added" \|\| moodToast === "saved"/);

const toastComponent = await readFile(
  new URL("../components/toast.tsx", import.meta.url),
  "utf8",
);
assert.match(toastComponent, /messageElement\.scrollHeight > lineHeight \+ 1/);
assert.match(toastComponent, /new ResizeObserver\(measureLines\)/);
assert.match(toastComponent, /isMultiline \? "multiline"/);

const supabaseIntakes = await readFile(
  new URL("../lib/repositories/intake-records/supabase.ts", import.meta.url),
  "utf8",
);
assert.match(supabaseIntakes, /\.delete\(\)[\s\S]*\.select\(INTAKE_COLUMNS\)/);
assert.match(supabaseIntakes, /await findByMedicationAndDate\(medicationId, date\)/);
const memberUpdateStart = supabaseIntakes.indexOf("async updateRecordedAt(");
const memberUpdateEnd = supabaseIntakes.indexOf("async migrateInitial(");
assert.notEqual(memberUpdateStart, -1);
assert.notEqual(memberUpdateEnd, -1);
const memberUpdateSource = supabaseIntakes.slice(memberUpdateStart, memberUpdateEnd);
assert.match(memberUpdateSource, /\.update\(\{ recorded_at: recordedAt \}\)/);
assert.match(memberUpdateSource, /\.eq\("user_id", userId\)/);
assert.match(memberUpdateSource, /\.eq\("medication_id", medicationId\)/);
assert.match(memberUpdateSource, /\.eq\("intake_date", date\)/);
assert.match(memberUpdateSource, /\.select\(INTAKE_COLUMNS\)[\s\S]*\.maybeSingle\(\)/);
assert.doesNotMatch(memberUpdateSource, /\.insert\(|\.upsert\(|\.delete\(/);

const recordedAtMigration = await readFile(
  new URL(
    "../supabase/migrations/20260823111623_allow_medication_intake_recorded_at_updates.sql",
    import.meta.url,
  ),
  "utf8",
);
assert.match(recordedAtMigration, /grant update \(recorded_at\)[\s\S]*to authenticated/);
assert.match(recordedAtMigration, /for update[\s\S]*to authenticated/);
assert.match(recordedAtMigration, /using \(\(select auth\.uid\(\)\) = user_id\)/);
assert.match(recordedAtMigration, /with check \(\(select auth\.uid\(\)\) = user_id\)/);
assert.doesNotMatch(recordedAtMigration, /alter table[\s\S]*(add|drop) column|primary key/i);

const weekProgress = await readFile(new URL("../lib/home-week-progress.ts", import.meta.url), "utf8");
assert.match(weekProgress, /record\.date === date(?:Key)? && record\.taken === true/);
assert.doesNotMatch(weekProgress, /recordedAt/);

const registrationSchedule = await readFile(
  new URL("../app/medications/new/schedule/page.tsx", import.meta.url),
  "utf8",
);
assert.match(registrationSchedule, /const toastId = createClientId\(\)/);
assert.match(registrationSchedule, /medicationToast=added&toastId=/);

console.log("PASS medication management fixtures");
