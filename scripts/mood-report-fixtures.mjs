import assert from "node:assert/strict";
import {
  buildMoodMonthlyReport,
  filterMoodRecordsByMonth,
  formatMoodReportMonth,
  listMoodReportMonths,
} from "../lib/mood-report.ts";

function moodRecord({
  id,
  date,
  medicationEffects = [],
  concentrationStates = [],
  timings = {},
  moods = [],
  relationships = [],
  legacy = false,
}) {
  return {
    id,
    date,
    mood: "good",
    moodLabel: "기분이 좋아요",
    recordedAt: `${date}T03:00:00.000Z`,
    ...(legacy ? {} : {
      details: {
        stepOneKind: concentrationStates.length > 0 ? "concentration" : "medication_effect",
        medicationEffects,
        concentrationStates,
        medicationEffectTimings: timings,
        moods,
        relationships,
        customText: {
          medicationEffect: "",
          mood: "",
          relationship: "",
        },
      },
    }),
  };
}

const augustRecords = [
  moodRecord({ id: "legacy", date: "2026-08-01", legacy: true }),
  moodRecord({
    id: "effective-lunch",
    date: "2026-08-02",
    medicationEffects: ["effective", "weak"],
    timings: { weak: ["점심"] },
    moods: ["irritable"],
    relationships: ["task"],
  }),
  moodRecord({
    id: "negative-morning",
    date: "2026-08-03",
    medicationEffects: ["strong", "weak"],
    timings: { weak: ["아침"] },
    moods: ["sleep"],
    relationships: ["none"],
  }),
  moodRecord({
    id: "lunch-evening-once",
    date: "2026-08-04",
    medicationEffects: ["weak"],
    concentrationStates: ["concentration_difficult"],
    timings: { weak: ["점심", "저녁"] },
    relationships: ["unfinished"],
  }),
  moodRecord({
    id: "no-medication-concentration",
    date: "2026-08-05",
    concentrationStates: ["concentration_unstable"],
    relationships: ["conversation"],
  }),
];

const records = [
  moodRecord({ id: "june", date: "2026-06-30", medicationEffects: ["effective"] }),
  moodRecord({ id: "july", date: "2026-07-15", moods: ["irritable"] }),
  ...augustRecords,
  moodRecord({ id: "invalid", date: "2026-13-01", legacy: true }),
];

assert.deepEqual(listMoodReportMonths([]), []);
assert.deepEqual(listMoodReportMonths(records.filter(({ date }) => date.startsWith("2026-08"))), ["2026-08"]);
assert.deepEqual(listMoodReportMonths(records.filter(({ date }) => date >= "2026-07" && date <= "2026-08-31")), ["2026-08", "2026-07"]);
assert.deepEqual(listMoodReportMonths(records), ["2026-08", "2026-07", "2026-06"]);
assert.equal(formatMoodReportMonth("2026-08"), "2026년 8월 리포트");
assert.deepEqual(filterMoodRecordsByMonth(records, "2026-05"), []);
console.log("PASS selectable months include only calendar months with records, newest first");

const report = buildMoodMonthlyReport(records, "2026-08");
assert.equal(report.totalDays, 5, "legacy record must remain in the total day count");
assert.equal(report.effectiveMedicationDays, 1, "only canonical effective is positive");
assert.equal(report.relationshipDifficultyDays, 3, "canonical non-none relationship days count once");
assert.deepEqual(
  Object.fromEntries(report.patterns.map(({ id, count }) => [id, count])),
  {
    afternoonMedicationDecline: 2,
    concentrationDifficulty: 3,
    irritability: 1,
    sleepDifficulty: 1,
    deadlineDifficulty: 1,
  },
);
assert.equal(
  report.patterns.find(({ id }) => id === "afternoonMedicationDecline")?.ratio,
  2 / 5,
);
assert.equal(
  report.patterns.find(({ id }) => id === "concentrationDifficulty")?.ratio,
  3 / 5,
);
console.log("PASS canonical monthly summary and five pattern counts");

assert.match(report.clinicPhrase, /집중하기 어려웠던 날이 3일/u);
assert.match(report.clinicPhrase, /오후가 되면서 약 효과가 줄어드는 느낌을 기록한 날이 2일/u);
assert.match(report.clinicPhrase, /평소보다 예민하게 느껴진 날이 한 차례/u);
assert.doesNotMatch(report.clinicPhrase, /용량|리바운드|진단|불면증|약이 맞지/u);
assert.doesNotMatch(report.clinicPhrase, /두통|식욕/u);
assert.ok(report.clinicPhrase.split(/[.!?](?:\s|$)/u).filter(Boolean).length <= 3);
assert.doesNotMatch(report.clinicPhrase, /있었어요\..*있었어요\.|어려웠던 날이[^.]+어려웠던 날이[^.]+어려웠던 날이/u);
console.log("PASS deterministic grounded clinic phrase and medical-safety wording");

const singleDayReport = buildMoodMonthlyReport([
  moodRecord({ id: "single", date: "2026-09-01", moods: ["sleep"] }),
], "2026-09");
assert.equal(singleDayReport.totalDays, 1);
assert.match(singleDayReport.clinicPhrase, /한 차례/u);
assert.doesNotMatch(singleDayReport.clinicPhrase, /반복/u);

const legacyOnlyReport = buildMoodMonthlyReport([
  moodRecord({ id: "legacy-only", date: "2026-10-01", legacy: true }),
], "2026-10");
assert.equal(legacyOnlyReport.totalDays, 1);
assert.ok(legacyOnlyReport.patterns.every(({ count }) => count === 0));
assert.match(legacyOnlyReport.clinicPhrase, /총 1일 감정 기록/u);
console.log("PASS one-day frequency and legacy no-inference behavior");

const fuzzyTextOnly = moodRecord({ id: "custom-only", date: "2026-11-01" });
fuzzyTextOnly.details.customText.mood = "예민하고 잠들기 어려웠어요";
const fuzzyReport = buildMoodMonthlyReport([fuzzyTextOnly], "2026-11");
assert.equal(fuzzyReport.patterns.find(({ id }) => id === "irritability")?.count, 0);
assert.equal(fuzzyReport.patterns.find(({ id }) => id === "sleepDifficulty")?.count, 0);
console.log("PASS labels and custom text are not fuzzy-matched into canonical counts");

const latestReport = buildMoodMonthlyReport([
  moodRecord({ id: "latest-1", date: "2026-12-01", medicationEffects: ["medication-focus-good", "work-focus-difficulty"], timings: { "work-focus-difficulty": ["점심"] }, moods: ["appetite-decrease"], relationships: ["conversation-flow"] }),
  moodRecord({ id: "latest-2", date: "2026-12-02", medicationEffects: ["task-completion-difficulty"], timings: { "task-completion-difficulty": [] }, relationships: ["conversation-understanding"] }),
], "2026-12");
assert.equal(latestReport.effectiveMedicationDays, 1);
assert.equal(latestReport.relationshipDifficultyDays, 2);
assert.equal(latestReport.patterns.find(({ id }) => id === "concentrationDifficulty")?.count, 1);
assert.equal(latestReport.patterns.find(({ id }) => id === "deadlineDifficulty")?.count, 1);
assert.equal(latestReport.patterns.find(({ id }) => id === "afternoonMedicationDecline")?.count, 0);
console.log("PASS latest work-focus, task-completion, social, and optional timing meanings remain separate");

console.log("Mood report fixtures passed (6 groups)");
