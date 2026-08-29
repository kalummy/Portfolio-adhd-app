import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  clearMoodDraft,
  getMoodDraftKey,
  readMoodDraft,
  writeMoodDraft,
} from "../lib/mood-draft.ts";
import { buildMoodDetails, determineMoodType, getMoodPresentation } from "../lib/mood-summary.ts";
import { resolveMoodMigrationSummary } from "../lib/repositories/moods/migration-summary.ts";

const answer = (selected = [], customText = "", timingsByOption = {}) => ({
  selected,
  customText,
  timingsByOption,
});

assert.equal(
  resolveMoodMigrationSummary({ memberSummary: "  현재 회원 요약  ", diaryEntries: ["예전 기록"] }),
  "  현재 회원 요약  ",
);
assert.equal(
  resolveMoodMigrationSummary({ diaryEntries: ["오전에 집중이 잘 됐어요.", "  오후에는 조금 피곤했어요.  "] }),
  "오전에 집중이 잘 됐어요. 오후에는 조금 피곤했어요.",
);
assert.equal(
  Array.from(resolveMoodMigrationSummary({ diaryEntries: ["가".repeat(301)] })).length,
  300,
);
assert.throws(
  () => resolveMoodMigrationSummary({ diaryEntries: ["  "] }),
  /이전할 수 있는 감정 요약이 없는 기록/u,
);
console.log("PASS current and legacy guest Mood summaries remain migration-compatible");
const draftAnswers = [
  answer(["similar"]),
  answer(["anxious"]),
  answer(["none"]),
];
const storageMap = new Map();
const storage = {
  getItem: (key) => storageMap.get(key) ?? null,
  setItem: (key, value) => storageMap.set(key, value),
  removeItem: (key) => storageMap.delete(key),
};

storage.setItem(getMoodDraftKey("2026-08-23"), JSON.stringify({
  version: 1,
  phase: "questions",
  step: 1,
  answers: draftAnswers,
}));
const migratedV1 = readMoodDraft(storage, "2026-08-23");
assert.equal(migratedV1?.version, 2);
assert.equal(migratedV1?.phase, "questions");
assert.equal(migratedV1?.stepOneKind, "medication_effect");
assert.deepEqual(migratedV1?.answers, draftAnswers);
console.log("PASS AS-IS version-1 question drafts remain restorable as version 2");

storage.setItem(getMoodDraftKey("2026-08-24"), JSON.stringify({
  version: 1,
  phase: "result",
  step: 2,
  answers: draftAnswers,
}));
assert.equal(readMoodDraft(storage, "2026-08-24")?.phase, "questions");
console.log("PASS legacy result drafts without a persisted reward safely return to questions");

storage.setItem(getMoodDraftKey("2026-08-24-placeholder"), JSON.stringify({
  version: 2,
  phase: "result",
  step: 2,
  answers: draftAnswers,
  stepOneKind: "medication_effect",
  catId: "unknown",
  recordedAt: "2026-08-24T03:00:00.000Z",
}));
const placeholderDraft = readMoodDraft(storage, "2026-08-24-placeholder");
assert.equal(placeholderDraft?.catId, undefined);
assert.equal(placeholderDraft?.phase, "questions");
console.log("PASS placeholder cat IDs cannot be restored as persisted rewards");

writeMoodDraft(storage, "2026-08-25", {
  phase: "result",
  step: 2,
  answers: draftAnswers,
  stepOneKind: "medication_effect",
  catId: "winter",
  recordedAt: "2026-08-25T03:00:00.000Z",
  analysisFailed: true,
});
assert.equal(readMoodDraft(storage, "2026-08-25")?.catId, "winter");
clearMoodDraft(storage, "2026-08-25");
assert.equal(readMoodDraft(storage, "2026-08-25"), null);
console.log("PASS To-Be reward drafts are date-scoped, restorable, and clearable");

const medicationDetails = buildMoodDetails([
  answer(["weak"], "", { weak: ["점심"] }),
  answer(["irritable", "sleep"]),
  answer(["task"]),
], "medication_effect");
assert.deepEqual(medicationDetails.medicationEffects, ["weak"]);
assert.deepEqual(medicationDetails.concentrationStates, []);
assert.deepEqual(medicationDetails.medicationEffectTimings.weak, ["점심"]);
assert.equal(determineMoodType([answer(), answer(["irritable"]), answer()]), "irritable");
assert.equal(getMoodPresentation("irritable").label, "예민해요");

const concentrationDetails = buildMoodDetails([
  answer(["work-focus-difficulty"], "", { "work-focus-difficulty": ["아침", "점심"] }),
  answer(["lethargic"]),
  answer(["none"]),
], "concentration");
assert.deepEqual(concentrationDetails.medicationEffects, []);
assert.deepEqual(concentrationDetails.concentrationStates, ["work-focus-difficulty"]);
assert.deepEqual(concentrationDetails.medicationEffectTimings, {});
console.log("PASS medication and no-intake concentration branches persist compatible structured details");

const flowSource = await readFile(new URL("../components/mood-question-flow.tsx", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../app/moods/new/page.tsx", import.meta.url), "utf8");
assert.match(flowSource, /window\.history\.pushState/);
assert.match(flowSource, /window\.history\.back\(\)/);
assert.match(flowSource, /title="감정 기록을 중단할까요\?"/);
assert.match(flowSource, /clearMoodDraft\(window\.sessionStorage, targetDateKey\)/);
assert.match(flowSource, /대화에 집중이 안되고 다른 생각을 했어요/);
assert.match(flowSource, /다른 사람의 이야기를 이해하기 어려웠어요/);
assert.match(flowSource, /혼자있고 싶었어요/);
assert.match(flowSource, /언제부터 그렇게 느꼈나요\? \(선택\)/);
assert.match(flowSource, /\["아침", "점심", "저녁"\]/);
assert.match(flowSource, /\/icons\/timing-check-selected\.svg/);
assert.match(flowSource, /\/icons\/timing-check-unselected\.svg/);
assert.doesNotMatch(flowSource, /aria-hidden="true">✓<\/span>/u);
assert.match(flowSource, /Object\.entries\(item\.timingsByOption \?\? \{\}\)\.filter\(\(\[key\]\) => key !== id\)/);
assert.doesNotMatch(flowSource, /stepOneKind === "medication_effect"\s*&& selected/u);
assert.match(flowSource, /destination\.searchParams\.set\("moodToast", "saved"\)/);
assert.match(flowSource, /await repository\.save/);
assert.ok(
  flowSource.indexOf("await repository.save")
    < flowSource.lastIndexOf("window.location.assign"),
);
assert.match(pageSource, /key=\{targetDateKey\}/);
console.log("PASS navigation, explicit draft discard, and navigation-after-save structure");

console.log("mood flow fixture cases: 5/5 passed");
