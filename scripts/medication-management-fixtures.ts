import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
// @ts-expect-error Node's type-stripping fixture runner imports production TypeScript directly.
import { formatScheduledTimeLabel, normalizeHourInput, parseScheduledTime, toScheduledTime } from "../lib/medication-time.ts";
// @ts-expect-error Node's type-stripping fixture runner imports production TypeScript directly.
import { fromSupabaseMedication, toSupabaseMedicationMigrationInput } from "../lib/repositories/medications/mapper.ts";

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

console.log("PASS medication management fixtures");
