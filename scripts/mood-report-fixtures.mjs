import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeClinicPhraseForDisplay } from "../lib/clinic-phrase.ts";
import {
  buildMoodMonthlyReport,
  filterMoodRecordsByMonth,
  formatMoodReportMonth,
  listMoodReportMonths,
} from "../lib/mood-report.ts";

function analysisResult(evidenceId, text) {
  return {
    todayEmotion: [{ text, evidenceIds: [evidenceId] }],
    clinicPhrase: { text, evidenceIds: [evidenceId] },
  };
}

function moodRecord({
  id,
  date,
  medicationEffects = [],
  concentrationStates = [],
  timings = {},
  moods = [],
  relationships = [],
  customMedication = "",
  customMood = "",
  customRelationship = "",
  savedAnalysis,
  legacy = false,
}) {
  return {
    id,
    date,
    mood: "good",
    moodLabel: "기분이 좋아요",
    recordedAt: `${date}T03:00:00.000Z`,
    ...(savedAnalysis ? { analysisResult: savedAnalysis } : {}),
    ...(legacy ? {} : {
      details: {
        stepOneKind: concentrationStates.length > 0 ? "concentration" : "medication_effect",
        medicationEffects,
        concentrationStates,
        medicationEffectTimings: timings,
        moods,
        relationships,
        customText: {
          medicationEffect: customMedication,
          mood: customMood,
          relationship: customRelationship,
        },
      },
    }),
  };
}

const monthRecords = [
  moodRecord({ id: "aug", date: "2026-08-01" }),
  moodRecord({ id: "july", date: "2026-07-15" }),
  moodRecord({ id: "invalid", date: "2026-13-01", legacy: true }),
];
assert.deepEqual(listMoodReportMonths([]), []);
assert.deepEqual(listMoodReportMonths(monthRecords), ["2026-08", "2026-07"]);
assert.equal(formatMoodReportMonth("2026-08"), "2026년 8월 리포트");
assert.deepEqual(filterMoodRecordsByMonth(monthRecords, "2026-05"), []);
console.log("PASS report month policy and invalid date filtering");

const positiveFocus = buildMoodMonthlyReport([
  moodRecord({ id: "selected", date: "2026-09-01", medicationEffects: ["medication-focus-good"] }),
  moodRecord({ id: "custom", date: "2026-09-02", customMedication: "오늘은 집중이 잘 됐어요" }),
  moodRecord({
    id: "evidence",
    date: "2026-09-03",
    customMedication: "업무 흐름이 좋았어요",
    savedAnalysis: analysisResult("step1:custom", "업무에 오래 집중할 수 있었어요."),
  }),
  moodRecord({ id: "negative", date: "2026-09-04", customMedication: "집중하려 했지만 잘 안 됐어요" }),
  moodRecord({ id: "mixed", date: "2026-09-05", customMedication: "오전에는 잘 됐지만 오후엔 전혀 집중이 안 됐어요" }),
  moodRecord({ id: "conflicting-selection", date: "2026-09-06", medicationEffects: ["medication-focus-good", "work-focus-difficulty"] }),
], "2026-09");
assert.equal(positiveFocus.totalDays, 6);
assert.equal(positiveFocus.effectiveMedicationDays, 3);
console.log("PASS positive focus selection, evidence-backed direct input, and conservative mixed exclusion");

const relationships = buildMoodMonthlyReport([
  moodRecord({ id: "none", date: "2026-10-01", relationships: ["none"] }),
  moodRecord({ id: "selected", date: "2026-10-02", relationships: ["conversation-flow"] }),
  moodRecord({ id: "no-problem", date: "2026-10-03", customRelationship: "사람들과 잘 지냈어요" }),
  moodRecord({ id: "difficult", date: "2026-10-04", customRelationship: "대화하는 게 어려웠어요" }),
  moodRecord({
    id: "conflict",
    date: "2026-10-05",
    relationships: ["conversation-understanding"],
    customRelationship: "대화하는 데 별다른 문제는 없었어요",
  }),
  moodRecord({
    id: "evidence",
    date: "2026-10-06",
    customRelationship: "사람들과 있는 게 버거웠어요",
    savedAnalysis: analysisResult("step3:custom", "사람들과 함께 있는 게 부담스러웠어요."),
  }),
], "2026-10");
assert.equal(relationships.relationshipDifficultyDays, 3);
console.log("PASS relationship none, difficulty, direct-input meaning, and conflict override");

const patterns = buildMoodMonthlyReport([
  moodRecord({
    id: "all",
    date: "2026-11-01",
    medicationEffects: ["work-focus-difficulty"],
    moods: ["irritable", "depressed", "lethargic"],
  }),
  moodRecord({
    id: "custom-decline",
    date: "2026-11-02",
    customMedication: "약효가 떨어지는 느낌이었어요",
    customMood: "예민하고 우울했어요",
  }),
  moodRecord({ id: "duplicate-a", date: "2026-11-03", medicationEffects: ["task-completion-difficulty"] }),
  moodRecord({ id: "duplicate-b", date: "2026-11-03", concentrationStates: ["concentration_unstable"] }),
], "2026-11");
assert.equal(patterns.totalDays, 3);
assert.deepEqual(
  Object.fromEntries(patterns.patterns.map(({ id, count }) => [id, count])),
  {
    medicationDecline: 3,
    concentrationDifficulty: 3,
    irritability: 1,
    depression: 1,
    lethargy: 1,
  },
);
assert.equal(patterns.patterns.find(({ id }) => id === "medicationDecline")?.ratio, 1);
assert.equal(patterns.patterns.find(({ id }) => id === "irritability")?.ratio, 1 / 3);
console.log("PASS five Figma patterns, direct focus decline, explicit-only moods, and same-day deduplication");

const empty = buildMoodMonthlyReport([], "2026-12");
assert.equal(empty.totalDays, 0);
assert.equal(empty.effectiveMedicationDays, 0);
assert.equal(empty.relationshipDifficultyDays, 0);
assert.ok(empty.patterns.every(({ count, ratio }) => count === 0 && ratio === 0));
console.log("PASS empty report avoids division by zero");

const legacy = buildMoodMonthlyReport([
  moodRecord({ id: "no-details", date: "2027-01-01", legacy: true }),
  moodRecord({
    id: "legacy-canonical",
    date: "2027-01-02",
    medicationEffects: ["effective"],
    moods: ["irritable", "depressed", "lethargic"],
    relationships: ["task"],
  }),
  moodRecord({ id: "legacy-concentration", date: "2027-01-03", concentrationStates: ["concentration_difficult"] }),
  moodRecord({ id: "legacy-weak", date: "2027-01-04", medicationEffects: ["weak"] }),
], "2027-01");
assert.equal(legacy.totalDays, 4);
assert.equal(legacy.effectiveMedicationDays, 1);
assert.equal(legacy.relationshipDifficultyDays, 1);
assert.equal(legacy.patterns.find(({ id }) => id === "medicationDecline")?.count, 2);
assert.equal(legacy.patterns.find(({ id }) => id === "concentrationDifficulty")?.count, 2);
console.log("PASS legacy records and canonical meanings remain readable without backfill");

assert.match(patterns.clinicPhrase, /^저는 이번 달/u);
assert.ok(patterns.clinicPhrase.split(/[.!?](?:\s|$)/u).filter(Boolean).length <= 2);
assert.doesNotMatch(patterns.clinicPhrase, /용량|리바운드|진단|처방|원인|부작용/u);
assert.equal(
  normalizeClinicPhraseForDisplay("약효가 줄었고,\r\n집중이   어려웠어요.\u2028진료에서 말하고 싶어요."),
  "약효가 줄었고, 집중이 어려웠어요. 진료에서 말하고 싶어요.",
);
const reportSource = await readFile(new URL("../components/mood-monthly-report.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
assert.match(reportSource, /normalizeClinicPhraseForDisplay\(report\.clinicPhrase\)/u);
assert.match(cssSource, /\.mood-report-clinic p \{[^}]*white-space: normal;/u);
assert.doesNotMatch(cssSource, /\.mood-report-clinic p \{[^}]*text-wrap: pretty;/u);
console.log("PASS first-person grounded clinic phrase and iOS-safe single-paragraph display");

console.log("Mood report fixtures passed (7 groups)");
