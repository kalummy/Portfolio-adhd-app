import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getHomeMedicationProjection } from "../lib/home-medication-projection.ts";
import { getWeekProgress } from "../lib/home-week-progress.ts";
import {
  addDaysToDateKey,
  getMonthCalendarDateKeys,
  getKstDateKey,
  isValidDateKey,
  moveMonthDateKey,
} from "../lib/kst-date.ts";

const date = "2026-08-22";
const intake = (medicationId, options = {}) => ({
  id: `${options.date ?? date}:${medicationId}`,
  medicationId,
  date: options.date ?? date,
  taken: options.taken ?? true,
  recordedAt: "2026-08-22T01:00:00.000Z",
});
const mood = {
  id: date,
  date,
  mood: "good",
  moodLabel: "기분 좋아요",
  recordedAt: "2026-08-22T02:00:00.000Z",
};
const activeMedications = ["med-a", "med-b", "med-c"];

const medication = (id, active) => ({
  id,
  name: `약 ${id}`,
  strengthValue: 10,
  strengthUnit: "mg",
  imagePath: "/icons/medication-fallback-64.svg",
  registrationMethod: "search",
  schedule: "daily",
  createdAt: "2026-08-20T00:00:00.000Z",
  active,
});
const medicationAActive = medication("A", true);
const medicationAInactive = medication("A", false);
const medicationCActive = medication("C", true);
const intakeFor = (medicationId, recordDate) => intake(medicationId, { date: recordDate });
const projectMedications = ({
  medications,
  intakeRecords,
  selectedDate,
  todayDate = "2026-08-24",
}) => getHomeMedicationProjection({ medications, intakeRecords, selectedDate, todayDate });

assert.deepEqual(
  projectMedications({
    medications: [medicationAActive],
    intakeRecords: [intakeFor("A", "2026-08-20")],
    selectedDate: "2026-08-20",
  }).map(({ id }) => id),
  ["A"],
  "PROJECTION CASE 1: active A with 8/20 intake is displayed",
);
assert.deepEqual(
  projectMedications({
    medications: [medicationAInactive],
    intakeRecords: [intakeFor("A", "2026-08-20")],
    selectedDate: "2026-08-20",
  }).map(({ id }) => id),
  ["A"],
  "PROJECTION CASE 2: inactive A with 8/20 intake remains displayed",
);
assert.deepEqual(
  projectMedications({
    medications: [medicationAInactive],
    intakeRecords: [],
    selectedDate: "2026-08-22",
  }),
  [],
  "PROJECTION CASE 3: inactive A without 8/22 intake is not displayed",
);
assert.deepEqual(
  projectMedications({
    medications: [medicationAInactive],
    intakeRecords: [intakeFor("A", "2026-08-22")],
    selectedDate: "2026-08-22",
  }).map(({ id }) => id),
  ["A"],
  "PROJECTION CASE 4: inactive A with 8/22 intake is displayed",
);
const afterReplacementIntakes = [
  intakeFor("A", "2026-08-20"),
  intakeFor("A", "2026-08-23"),
];
assert.deepEqual(
  projectMedications({
    medications: [medicationAInactive, medicationCActive],
    intakeRecords: afterReplacementIntakes,
    selectedDate: "2026-08-20",
  }).map(({ id }) => id),
  ["A", "C"],
  "PROJECTION CASE 5: A history and active C coexist without replacing IDs",
);
assert.deepEqual(
  projectMedications({
    medications: [medicationAInactive, medicationCActive],
    intakeRecords: afterReplacementIntakes,
    selectedDate: "2026-08-23",
  }).map(({ id }) => id),
  ["A", "C"],
  "PROJECTION CASE 5: A 8/23 history remains visible after C registration",
);
assert.equal(
  afterReplacementIntakes.some((record) => (
    record.medicationId === "C" && record.date === "2026-08-20"
  )),
  false,
  "PROJECTION CASE 5: A intake is not mixed into C",
);
assert.deepEqual(
  projectMedications({
    medications: [medicationAInactive, medicationCActive],
    intakeRecords: [intakeFor("A", "2026-08-24")],
    selectedDate: "2026-08-24",
  }).map(({ id }) => id),
  ["C"],
  "PROJECTION CASE 6: current date does not expose inactive A",
);

assert.equal(
  getWeekProgress(date, [intake("med-a")], [mood]),
  "complete",
  "CASE A: intake and mood = 100%",
);
assert.equal(
  getWeekProgress(date, [intake("med-a")], []),
  "partial",
  "CASE B: intake only = 50%",
);
assert.equal(
  getWeekProgress(date, [], [mood]),
  "partial",
  "CASE C: mood only = 50%",
);
assert.equal(
  getWeekProgress(date, [], []),
  "empty",
  "CASE D: no intake or mood = 0%",
);
assert.equal(activeMedications.length, 3, "CASE E fixture has three active medications");
assert.equal(
  getWeekProgress(date, [], [mood]),
  "partial",
  "CASE E: active medications without intake plus mood = 50%",
);
assert.equal(activeMedications.length, 3, "CASE F fixture has three active medications");
assert.equal(
  getWeekProgress(date, [], []),
  "empty",
  "CASE F: active medications without intake or mood = 0%",
);
assert.equal(
  getWeekProgress(date, [intake("med-a", { taken: false })], [mood]),
  "partial",
  "CASE G: taken=false plus mood = 50%",
);
assert.equal(
  getWeekProgress(date, [intake("med-a", { date: "2026-08-21" })], [mood]),
  "partial",
  "CASE H: another date intake plus current mood = 50%",
);
assert.equal(
  getWeekProgress(date, [intake("med-a", { taken: "false" })], [mood]),
  "partial",
  "REGRESSION: a non-boolean truthy taken value is not a completed intake",
);

assert.equal(getKstDateKey(new Date("2026-08-23T14:59:59.000Z")), "2026-08-23");
assert.equal(getKstDateKey(new Date("2026-08-23T15:00:00.000Z")), "2026-08-24");
assert.equal(addDaysToDateKey("2026-08-31", 1), "2026-09-01");
assert.equal(moveMonthDateKey("2026-12-15", 1), "2027-01-01");
assert.equal(isValidDateKey("2026-02-29"), false);
assert.equal(isValidDateKey("2028-02-29"), true);

const augustCalendarDates = getMonthCalendarDateKeys("2026-08-01");
assert.equal(augustCalendarDates.length, 42, "August 2026 requires six calendar rows");
assert.equal(augustCalendarDates.includes("2026-08-31"), true, "August 31 remains visible");

const globalCss = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
assert.match(
  globalCss,
  /\.home-date-picker-sheet[\s\S]*?height: min\(650px, calc\(100dvh - env\(safe-area-inset-top\)\)\)/,
);
const homeCalendarCss = globalCss.match(/\.home-calendar \{([^}]*)\}/)?.[1] ?? "";
assert.match(homeCalendarCss, /height: 422px/);
assert.match(homeCalendarCss, /overflow: hidden/);
assert.doesNotMatch(homeCalendarCss, /overflow-y: auto/);
assert.match(globalCss, /\.home-calendar-weekdays \{[\s\S]*?min-height: 26px/);
assert.match(globalCss, /grid-template-columns: repeat\(7, minmax\(0, 44px\)\)/);
assert.match(globalCss, /\.home-calendar-grid button \{[\s\S]*?aspect-ratio: 1/);

for (const viewportWidth of [320, 360, 375, 390, 430]) {
  const contentWidth = viewportWidth - 40;
  const cellWidth = Math.min(44, contentWidth / 7);
  assert.ok(
    cellWidth * 7 <= contentWidth,
    `${viewportWidth}px calendar columns stay inside the 20px side padding`,
  );
}

console.log("PASS home date picker progress and KST date fixtures");
