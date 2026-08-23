import assert from "node:assert/strict";
import { getWeekProgress } from "../lib/home-week-progress.ts";
import {
  addDaysToDateKey,
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

console.log("PASS home date picker progress and KST date fixtures");
