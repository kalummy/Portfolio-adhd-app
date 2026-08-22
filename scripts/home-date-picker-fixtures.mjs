import assert from "node:assert/strict";
import { getWeekProgress } from "../lib/home-week-progress.ts";
import {
  addDaysToDateKey,
  getKstDateKey,
  isValidDateKey,
  moveMonthDateKey,
} from "../lib/kst-date.ts";

const date = "2026-08-23";
const intake = (medicationId) => ({
  id: `${date}:${medicationId}`,
  medicationId,
  date,
  taken: true,
  recordedAt: "2026-08-23T01:00:00.000Z",
});
const mood = {
  id: date,
  date,
  mood: "good",
  moodLabel: "기분 좋아요",
  recordedAt: "2026-08-23T02:00:00.000Z",
};

assert.equal(getWeekProgress(date, [], []), "empty", "no records = 0%");
assert.equal(getWeekProgress(date, [intake("med-a")], []), "partial", "intake only = 50%");
assert.equal(getWeekProgress(date, [], [mood]), "partial", "mood only = 50%");
assert.equal(
  getWeekProgress(date, [intake("med-a")], [mood]),
  "complete",
  "intake and mood = 100%",
);
assert.equal(
  getWeekProgress(date, [intake("med-a")], []),
  "partial",
  "one of three medications taken without mood = 50%",
);
assert.equal(
  getWeekProgress(date, [intake("med-a")], [mood]),
  "complete",
  "one of three medications taken with mood = 100%",
);

assert.equal(getKstDateKey(new Date("2026-08-23T14:59:59.000Z")), "2026-08-23");
assert.equal(getKstDateKey(new Date("2026-08-23T15:00:00.000Z")), "2026-08-24");
assert.equal(addDaysToDateKey("2026-08-31", 1), "2026-09-01");
assert.equal(moveMonthDateKey("2026-12-15", 1), "2027-01-01");
assert.equal(isValidDateKey("2026-02-29"), false);
assert.equal(isValidDateKey("2028-02-29"), true);

console.log("PASS home date picker progress and KST date fixtures");
