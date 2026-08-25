import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CAT_CATALOG, UNKNOWN_CAT, selectRandomCatId } from "../lib/cats.ts";
import { deriveCatCollection } from "../lib/cat-collection.ts";
import {
  LOCAL_PREVIEW_MOOD_MODEL,
  createLocalPreviewMoodAnalysis,
  createMoodAnalysisInput,
  validateMoodAnalysisResult,
} from "../lib/mood-analysis.ts";
import {
  filterRecentMoodRecords,
  getMoodHistoryDateRange,
  formatMoodRecordDateTime,
  getRecentMoodDateRange,
  MOOD_HISTORY_PERIODS,
} from "../lib/mood-history.ts";

assert.equal(CAT_CATALOG.length, 5);
assert.equal(CAT_CATALOG.some((cat) => cat.displayName === UNKNOWN_CAT.displayName), false);
assert.deepEqual(
  [0, 0.2, 0.4, 0.6, 0.8].map(selectRandomCatId),
  ["white", "calico", "tuxedo", "rainbow", "sunglasses"],
);
assert.equal(selectRandomCatId(0), selectRandomCatId(0));
console.log("PASS reward catalog, placeholder exclusion, equal buckets, and stable selection input");

const emptyCollection = deriveCatCollection([
  { catId: null },
  { catId: undefined },
  { catId: "not-in-catalog" },
]);
assert.equal(emptyCollection.length, 5);
assert.equal(emptyCollection.every((cat) => !cat.acquired), true);
assert.equal(emptyCollection.every((cat) => cat.displayName === "???"), true);
assert.equal(emptyCollection.every((cat) => cat.imagePath === UNKNOWN_CAT.imagePath), true);

const duplicateCollection = deriveCatCollection([
  { catId: "white" },
  { catId: "white" },
  { catId: null },
]);
assert.equal(duplicateCollection.filter((cat) => cat.acquired).length, 1);
assert.equal(duplicateCollection[0].catalogId, "white");
assert.equal(duplicateCollection[0].displayName, "하냥이");

const multiCollection = deriveCatCollection([
  { catId: "sunglasses" },
  { catId: "calico" },
  { catId: "calico" },
]);
assert.deepEqual(
  multiCollection.map((cat) => cat.catalogId),
  ["calico", "sunglasses", "white", "tuxedo", "rainbow"],
);
assert.deepEqual(
  multiCollection.map((cat) => cat.acquired),
  [true, true, false, false, false],
);

const afterDeleteCollection = deriveCatCollection([
  { catId: "calico" },
  { catId: null },
]);
assert.equal(afterDeleteCollection.find((cat) => cat.catalogId === "white")?.acquired, false);
assert.equal(afterDeleteCollection.find((cat) => cat.catalogId === "calico")?.acquired, true);
const lockedFirstCollection = deriveCatCollection([
  { catId: "white" },
], "locked-first");
assert.equal(lockedFirstCollection[0]?.acquired, false);
assert.equal(lockedFirstCollection.at(-1)?.catalogId, "white");
console.log("PASS cat collection zero, one, duplicate, multiple, legacy, and deletion-derived states");

const answers = [
  { selected: ["weak"], customText: "", timingsByOption: { weak: ["점심", "저녁"] } },
  { selected: ["irritable"], customText: "", timingsByOption: {} },
  { selected: ["task"], customText: "", timingsByOption: {} },
];
const input = createMoodAnalysisInput({
  date: "2026-08-25",
  recordedAt: "2026-08-25T04:00:00.000Z",
  stepOneKind: "medication_effect",
  answers,
  intakeMedicationIds: ["med-1"],
});
const valid = {
  todayEmotion: [
    { text: "점심부터 약효가 약하게 느껴졌어요.", evidenceIds: ["step1:weak"] },
    { text: "예민하게 느껴지는 순간이 있었어요.", evidenceIds: ["step2:irritable"] },
  ],
  clinicPhrase: {
    text: "점심부터 약효가 약하게 느껴졌고 업무 집중도 어려웠어요.",
    evidenceIds: ["step1:weak", "step3:task"],
  },
};
assert.deepEqual(validateMoodAnalysisResult(valid, input), valid);
assert.throws(
  () => validateMoodAnalysisResult({
    ...valid,
    clinicPhrase: { text: "기록을 정리했어요.", evidenceIds: ["unknown"] },
  }, input),
  /invalid_evidence/,
);
assert.throws(
  () => validateMoodAnalysisResult({
    ...valid,
    clinicPhrase: { text: "약 용량을 늘려야 합니다.", evidenceIds: ["step1:weak"] },
  }, input),
  /unsafe_medical_claim/,
);
assert.equal("userId" in input || "email" in input || "name" in input, false);
assert.equal(input.evidence.some((item) => item.category === "medication"), false);
console.log("PASS evidence validation and account/medication-name exclusion");

const preview = createLocalPreviewMoodAnalysis(input, "2026-08-25T04:00:01.000Z");
assert.equal(preview.model, LOCAL_PREVIEW_MOOD_MODEL);
assert.equal(preview.result.todayEmotion.length, 3);
assert.equal(preview.result.todayEmotion.some((item) => item.text.includes("두통")), false);
assert.equal(preview.result.todayEmotion.some((item) => item.text === preview.result.clinicPhrase.text), false);
assert.equal(preview.result.todayEmotion.some((item) => preview.result.clinicPhrase.text.includes(item.text)), false);
assert.deepEqual(validateMoodAnalysisResult(preview.result, input), preview.result);
console.log("PASS non-production preview produces distinct grounded card content");

const clinicQualityInput = createMoodAnalysisInput({
  date: "2026-08-25",
  recordedAt: "2026-08-25T04:00:00.000Z",
  stepOneKind: "medication_effect",
  answers: [
    { selected: ["weak"], customText: "", timingsByOption: { weak: ["점심"] } },
    { selected: ["irritable", "sleep"], customText: "", timingsByOption: {} },
    { selected: ["task"], customText: "", timingsByOption: {} },
  ],
  intakeMedicationIds: ["med-1"],
});
const clinicQualityPreview = createLocalPreviewMoodAnalysis(clinicQualityInput).result.clinicPhrase;
const clinicSentenceCount = clinicQualityPreview.text.split(/[.!?](?:\s|$)/u).filter(Boolean).length;
assert.ok(clinicSentenceCount >= 1 && clinicSentenceCount <= 3);
assert.match(clinicQualityPreview.text, /점심 무렵부터 약 효과가 줄어드는 느낌/u);
assert.match(clinicQualityPreview.text, /업무나 과제를 할 때 집중을 유지하기 어려웠고/u);
assert.match(clinicQualityPreview.text, /예민함 및 수면 관련 어려움이 함께 나타났습니다/u);
assert.doesNotMatch(clinicQualityPreview.text, /어려웠고.{0,40}어려웠고|했어요\..*했어요\..*했어요\./u);
assert.doesNotMatch(clinicQualityPreview.text, /두통|식욕|용량|리바운드|진단|처방/u);
assert.deepEqual(
  [...clinicQualityPreview.evidenceIds].sort(),
  clinicQualityInput.evidence.map((item) => item.id).sort(),
);
console.log("PASS clinic phrase integrates related evidence without repetitive wording");

const directInput = createMoodAnalysisInput({
  date: "2026-08-25",
  recordedAt: "2026-08-25T04:00:00.000Z",
  stepOneKind: "concentration",
  answers: [
    { selected: ["custom"], customText: "외부로 보내면 안 되는 직접 입력", timingsByOption: {} },
    { selected: ["custom"], customText: "민감한 감정 원문", timingsByOption: {} },
    { selected: ["none"], customText: "", timingsByOption: {} },
  ],
  intakeMedicationIds: [],
});
assert.equal(directInput.evidence.some((item) => item.label === "외부로 보내면 안 되는 직접 입력"), true);
assert.equal("userId" in directInput || "email" in directInput || "name" in directInput, false);
console.log("PASS direct input is grounded evidence while account identifiers are excluded");

const flowSource = await readFile(new URL("../components/mood-question-flow.tsx", import.meta.url), "utf8");
const repositorySource = await readFile(new URL("../lib/repositories/moods/supabase.ts", import.meta.url), "utf8");
const idbSource = await readFile(new URL("../lib/indexed-db.ts", import.meta.url), "utf8");
const resultSource = await readFile(new URL("../components/mood-result.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const routeSource = await readFile(new URL("../app/api/moods/analyze/route.ts", import.meta.url), "utf8");
const mapperSource = await readFile(new URL("../lib/repositories/moods/mapper.ts", import.meta.url), "utf8");
const guestMergeSource = await readFile(new URL("../lib/repositories/guest-dataset.ts", import.meta.url), "utf8");
const migrationSource = await readFile(new URL("../supabase/migrations/20260825090000_add_mood_cat_and_analysis.sql", import.meta.url), "utf8");
const anonRevokeMigrationSource = await readFile(new URL("../supabase/migrations/20260825132511_revoke_anon_execute_on_merge_guest_dataset_v2.sql", import.meta.url), "utf8");
const homeSource = await readFile(new URL("../components/home-screen.tsx", import.meta.url), "utf8");
const revealSource = await readFile(new URL("../components/mood-summary-loading.tsx", import.meta.url), "utf8");
const reportSource = await readFile(new URL("../components/mood-monthly-report.tsx", import.meta.url), "utf8");
const sheetMotionSource = await readFile(new URL("../components/use-mood-bottom-sheet.ts", import.meta.url), "utf8");

assert.match(flowSource, /type="checkbox"/);
assert.doesNotMatch(flowSource, /name=\{step === 2 \? "relationship"/);
assert.match(flowSource, /item\.selected\.filter\(\(value\) => value !== "none"\)/);
assert.match(flowSource, /stepOneKind === "medication_effect" \? MEDICATION_STEP : CONCENTRATION_STEP/);
assert.match(flowSource, /catId \?\? selectRandomCatId\(\)/);
assert.match(repositorySource, /\.insert\(toSupabaseMood/);
assert.doesNotMatch(repositorySource, /\.upsert\(/);
assert.match(idbSource, /moodStore\.add\(saved\)/);
assert.match(flowSource, /DuplicateMoodRecordError/);
console.log("PASS question branching, stable reward, and create-only duplicate defense");

assert.match(routeSource, /requestOpenAIMoodAnalysis/);
assert.match(routeSource, /process\.env\.OPENAI_API_KEY/);
assert.match(routeSource, /AI_NOT_CONFIGURED/);
assert.match(routeSource, /process\.env\.VERCEL_ENV !== "production"/);
assert.match(routeSource, /createLocalPreviewMoodAnalysis/);
assert.doesNotMatch(flowSource, /OPENAI_API_KEY|api\.openai/u);
assert.match(resultSource, /오늘의 감정기록을 확인해주세요\./);
assert.match(resultSource, /오늘 내 감정/);
assert.match(resultSource, /병원에서 이렇게 이야기 해보세요/);
assert.match(resultSource, />\s*저장\s*</);
assert.doesNotMatch(resultSource, /분석 결과를 만들지 못했어요|분석 다시 시도|오늘도 감정을 기록해줘서 고마워요/u);
assert.match(resultSource, /mood-check-card/);
assert.match(resultSource, /mood-clinic-card/);
assert.match(cssSource, /\.mood-result-cat-frame \{[^}]*width: 160px;[^}]*height: 160px;/u);
assert.match(cssSource, /\.mood-check-card \{ margin-top: 0;/u);
assert.match(flowSource, /analysisStatus: "completed"/);
assert.doesNotMatch(flowSource, /experiment_variant|experiment_id|experiment_exposed/u);
assert.match(homeSource, /getMoodPresentation\(record\.mood\)\.label/);
console.log("PASS Figma-fixed result copy/layout hooks and non-production preview routing");

assert.doesNotMatch(homeSource, /record\.analysisResult\?\.todayEmotion/);
assert.match(homeSource, /record\.analysisResult\?\.clinicPhrase/);
assert.match(homeSource, /getMoodPresentation\(record\.mood\)\.label/);
assert.match(homeSource, /isCatId\(moodRecord\.catId\)/);
assert.match(homeSource, /getCat\(moodRecord\.catId\)/);
assert.match(revealSource, /MOOD_CAT_REVEAL_DURATION_MS = 2000/);
assert.match(revealSource, /두근 두근/);
assert.match(revealSource, /어떤 고양이가 나올까요\?/);
assert.match(revealSource, /UNKNOWN_CAT\.imagePath/);
assert.doesNotMatch(revealSource, /기록중이에요|작성중이에요|분석 중이에요|잠시만 기다려주세요/u);
assert.match(sheetMotionSource, /MOOD_BOTTOM_SHEET_DURATION_MS = 280/);
assert.match(reportSource, /useMoodBottomSheet\(\)/);
assert.match(reportSource, /monthSheet\.open\(\)/);
assert.match(reportSource, /onPointerDown=\{handlePickerPointerDown\}/);
assert.match(reportSource, /addEventListener\("wheel", handlePickerWheel, \{ passive: false \}\)/);
assert.match(reportSource, /pickerRowCount === 0 \? 0 : 48 \+ \(\(pickerRowCount - 1\) \* 56\)/);
assert.match(reportSource, /pickerMonths\.length <= 2 \? index : relativeIndex \+ 1/);
assert.match(cssSource, /\.mood-bottom-sheet-panel \{[^}]*translate3d\(0, 100%, 0\)[^}]*280ms/u);
assert.match(cssSource, /\.mood-bottom-sheet-layer\.is-entered \.mood-bottom-sheet-panel \{[^}]*translate3d\(0, 0, 0\)/u);
assert.match(cssSource, /\.mood-report-month-options\.is-settling button \{[^}]*transform 220ms[^}]*opacity 200ms/u);
console.log("PASS To-Be Home record, 2-second cat reveal, and Bottom Sheet motion wiring");

assert.match(mapperSource, /catId: row\.cat_id \?\? null/);
assert.match(mapperSource, /analysisStatus: row\.analysis_status \?\? null/);
assert.match(guestMergeSource, /merge_guest_dataset_v2/);
assert.match(migrationSource, /add column if not exists cat_id text/);
assert.match(migrationSource, /create or replace function public\.merge_guest_dataset_v2/);
assert.match(migrationSource, /security invoker/);
assert.match(migrationSource, /revoke all on function public\.merge_guest_dataset_v2\(text, jsonb, jsonb, jsonb, jsonb\) from public;/u);
assert.match(migrationSource, /grant execute on function public\.merge_guest_dataset_v2\(text, jsonb, jsonb, jsonb, jsonb\) to authenticated;/u);
assert.doesNotMatch(migrationSource, /\b(?:grant|revoke)\b[^;]*\bon table public\.mood_records\b/iu);
assert.doesNotMatch(migrationSource, /(?:enable|disable) row level security|(?:create|alter|drop) policy/iu);
assert.match(anonRevokeMigrationSource, /revoke execute on function public\.merge_guest_dataset_v2\(\s*text,\s*jsonb,\s*jsonb,\s*jsonb,\s*jsonb\s*\) from anon;/u);
assert.match(migrationSource, /not \(incoming\.mood_date = any\(v_existing_mood_dates\)\)/);
assert.match(migrationSource, /details = incoming\.details/);
assert.match(migrationSource, /analysis_result = incoming\.analysis_result/);
console.log("PASS nullable legacy mapping and guest-to-member metadata preservation wiring");

const rollingRecords = [
  { id: "old", date: "2026-07-26", recordedAt: "2026-07-26T12:00:00.000Z" },
  { id: "same-early", date: "2026-08-24", recordedAt: "2026-08-24T01:00:00.000Z" },
  { id: "latest", date: "2026-08-25", recordedAt: "2026-08-25T01:00:00.000Z" },
  { id: "same-late", date: "2026-08-24", recordedAt: "2026-08-24T04:00:00.000Z" },
];
assert.deepEqual(getRecentMoodDateRange("2026-08-25"), {
  startDate: "2026-07-27",
  endDate: "2026-08-25",
});
assert.deepEqual(getMoodHistoryDateRange("3m", "2026-08-25"), {
  startDate: "2026-05-28",
  endDate: "2026-08-25",
});
assert.deepEqual(getMoodHistoryDateRange("1y", "2026-08-25"), {
  startDate: "2025-08-26",
  endDate: "2026-08-25",
});
assert.deepEqual(
  MOOD_HISTORY_PERIODS.map(({ value, optionLabel }) => ({ value, optionLabel })),
  [
    { value: "1m", optionLabel: "1개월" },
    { value: "3m", optionLabel: "3개월" },
    { value: "1y", optionLabel: "1년" },
  ],
);
assert.deepEqual(
  filterRecentMoodRecords(rollingRecords, "2026-08-25").map((record) => record.id),
  ["latest", "same-late", "same-early"],
);
assert.equal(
  formatMoodRecordDateTime({ date: "2026-08-25", recordedAt: "2026-08-25T04:05:00.000Z" }),
  "2026-08-25(화) 13:05",
);

const historySource = await readFile(new URL("../components/mood-history.tsx", import.meta.url), "utf8");
const collectionSource = await readFile(new URL("../components/mood-cat-collection.tsx", import.meta.url), "utf8");
const detailSource = await readFile(new URL("../components/mood-record-detail.tsx", import.meta.url), "utf8");
const repositoryTypeSource = await readFile(new URL("../lib/repositories/moods/types.ts", import.meta.url), "utf8");
assert.match(repositorySource, /\.gte\("mood_date", startDate\)/);
assert.match(repositorySource, /\.order\("mood_date", \{ ascending: false \}\)/);
assert.match(repositorySource, /\.delete\(\)/);
assert.match(idbSource, /moodStore\.delete\(date\)/);
assert.match(idbSource, /moodRecordIds: state\.moodRecordIds\.filter/);
assert.match(repositoryTypeSource, /listRecent\(startDate: string, endDate: string\)/);
assert.match(repositoryTypeSource, /deleteByDate\(date: string\)/);
assert.match(historySource, /repository\.listRecent\(startDate, endDate\)/);
assert.match(historySource, /repository\.listAll\(\)/);
assert.match(historySource, /trackCatCollectionViewed\(\)/);
assert.match(historySource, /최근 \{appliedPeriodLabel\}/);
assert.match(historySource, /onClick=\{openPeriodSheet\}/);
assert.match(historySource, /조회 기간을 선택해주세요/);
assert.match(historySource, /MOOD_HISTORY_PERIODS\.map/);
assert.match(historySource, /setPendingPeriod\(period\.value\)/);
assert.match(historySource, /setAppliedPeriod\(selectedPeriod\)/);
assert.match(historySource, /getMoodHistoryDateRange\(appliedPeriod\)/);
assert.match(historySource, /UNKNOWN_CAT/);
assert.match(collectionSource, /deriveCatCollection\(records, showLockedFirst \? "locked-first" : "acquired-first"\)/);
assert.match(collectionSource, /setShowLockedFirst\(\(current\) => !current\)/);
assert.match(collectionSource, /useState\(false\)/);
assert.match(collectionSource, /showLockedFirst \? "미보유순" : "보유순"/);
assert.match(collectionSource, /cat\.acquired \? `cat-\$\{cat\.catalogId\}` : "cat-unknown"/);
assert.doesNotMatch(collectionSource, /IndexedDB|Supabase|createBrowserSupabaseClient/u);
assert.match(detailSource, /record\.analysisResult\?\.todayEmotion/);
assert.match(detailSource, /repository\.findByDate\(dateKey\)/);
assert.match(detailSource, /repository\.deleteByDate\(record\.date\)/);
assert.doesNotMatch(detailSource, /api\/moods\/analyze|createMoodAnalysisInput|requestOpenAI/u);
assert.match(cssSource, /\.mood-record-detail-header \{[^}]*position: fixed;/u);
assert.match(cssSource, /\.recorded-mood-item strong \{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/u);
assert.match(cssSource, /\.mood-diary-card \{[^}]*gap: 16px;/u);
assert.match(cssSource, /\.mood-diary-card p \{[^}]*font-size: 16px;[^}]*line-height: 24px;/u);
console.log("PASS rolling 30-day order, stored detail, legacy fallback, and guest/member deletion wiring");

console.log("mood To-Be fixture cases: 10/10 passed");
