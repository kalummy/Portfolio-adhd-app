import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = new URL("../", import.meta.url);
const projectRootPath = fileURLToPath(projectRoot);
const fixtureDirectory = await mkdtemp(join(tmpdir(), "addi-mood-fixtures-"));

try {
  execFileSync(join(projectRootPath, "node_modules/.bin/tsc"), [
    "--ignoreConfig",
    "--target", "es2022",
    "--module", "es2022",
    "--moduleResolution", "bundler",
    "--skipLibCheck",
    "--outDir", fixtureDirectory,
    "lib/visit-date.ts",
    "lib/mood-history.ts",
    "lib/mood-summary.ts",
  ], { cwd: projectRootPath, stdio: "pipe" });
  await copyFile(join(fixtureDirectory, "visit-date.js"), join(fixtureDirectory, "visit-date"));
  await writeFile(join(fixtureDirectory, "package.json"), '{"type":"module"}');

  const history = await import(pathToFileURL(join(fixtureDirectory, "mood-history.js")));
  const summary = await import(pathToFileURL(join(fixtureDirectory, "mood-summary.js")));

  const answer = (selected = [], customText = "") => ({ selected, customText });
  const draft = (q1, q4 = answer(["same"])) => [
    q1,
    answer(["focused"]),
    answer(["none"]),
    q4,
  ];
  const recordedAt = "2026-08-19T03:04:05.000Z";

  const mappingCases = [
    ["good", draft(answer(["good"])), "good"],
    ["lethargic", draft(answer(["lethargic"])), "lethargic"],
    ["lethargic-depressed", draft(answer(["lethargic", "depressed-irritable"])), "lethargic-depressed"],
    ["irritable", draft(answer(["depressed-irritable"])), "irritable"],
    ["poor-condition", draft(answer(["same"]), answer(["tired"])), "poor-condition"],
    ["neutral fallback", draft(answer(["same"])), "good"],
  ];

  for (const [name, answers, expected] of mappingCases) {
    assert.equal(summary.determineMoodType(answers), expected);
    console.log(`PASS mapping ${name}`);
  }

  const unselectedCustom = summary.buildMoodSummary(
    draft(answer(["good"], "선택되지 않은 직접 입력")),
    recordedAt,
  );
  assert.equal(unselectedCustom.recordedAt, recordedAt);
  assert.equal(unselectedCustom.summaryItems.some((item) => item.includes("선택되지 않은")), false);

  const selectedCustomDraft = draft(answer(["good", "custom"], "마음이 편안해요"));
  const selectedCustom = summary.buildMoodSummary(selectedCustomDraft, recordedAt);
  assert.equal(selectedCustom.summaryItems[0].includes("마음이 편안해요"), true);
  assert.equal(selectedCustom.summaryItems.some((item) => item.includes("약이 좀 센")), false);
  console.log("PASS summary uses selected answers and selected custom text only");

  const clinicianReady = summary.buildMoodSummary([
    answer(["good", "lethargic", "depressed-irritable"]),
    answer(["focused", "wore-off-early"]),
    answer(["low-appetite", "headache"]),
    answer(["trouble-sleeping", "tired", "anxious"]),
  ], recordedAt);
  assert.equal(clinicianReady.summaryItems.length, 1);
  assert.equal(clinicianReady.summaryItems.every((item) => item.length < 90), true);
  assert.equal(clinicianReady.summaryItems[0].includes("기분 기복·무기력·우울감"), true);
  assert.equal(clinicianReady.summaryItems[0].includes("오후 약효 저하"), true);
  assert.equal(clinicianReady.summaryItems[0].includes("몸 상태 변화"), true);
  assert.equal(clinicianReady.summaryItems.some((item) => item.includes("오늘 내 감정은 대체로")), false);
  assert.equal(clinicianReady.summaryItems[0].split(/[.!?]/u).filter(Boolean).length <= 2, true);
  console.log("PASS summary synthesizes clinician-ready context in a concise diary line");

  const legacySummary = summary.getMoodDiarySummary([
    "오늘 내 감정은 대체로 무기력하고 우울했어요.",
    "약을 먹고 오후에 약 효과가 빨리 내려갔어요.",
    "복용하면서 두통이 있었어요.",
    "오늘은 피곤하고 긴장되었어요.",
  ]);
  assert.equal(legacySummary, "오늘은 무기력·우울감과 오후 약효 저하가 있었고, 몸 상태 변화도 느꼈어요.");
  assert.equal(legacySummary.includes("오늘 내 감정은 대체로"), false);
  console.log("PASS legacy multi-entry diary renders as one integrated summary without rewriting storage");

  const now = new Date(2026, 7, 19, 12, 0, 0);
  const moodRecord = (date, suffix) => ({
    id: date,
    date,
    mood: "good",
    moodLabel: "기분이 좋아요",
    recordedAt: `${date}T${suffix}:00.000+09:00`,
    diaryEntries: [date],
  });
  const records = [
    moodRecord("2026-07-18", "09:00"),
    moodRecord("2026-07-19", "09:00"),
    moodRecord("2026-08-12", "09:00"),
    moodRecord("2026-08-13", "09:00"),
    moodRecord("2026-08-19", "08:00"),
    moodRecord("2026-08-19", "11:00"),
    moodRecord("2026-08-20", "09:00"),
  ];

  const week = history.filterMoodRecordsByPeriod(records, "1w", now);
  assert.deepEqual(week.map((record) => record.date), ["2026-08-19", "2026-08-19", "2026-08-13"]);
  assert.equal(week[0].recordedAt.includes("11:00"), true);

  const month = history.filterMoodRecordsByPeriod(records, "1m", now);
  assert.equal(month.some((record) => record.date === "2026-07-19"), true);
  assert.equal(month.some((record) => record.date === "2026-07-18"), false);
  assert.equal(month.some((record) => record.date === "2026-08-20"), false);
  console.log("PASS period filter local boundaries, future exclusion, and newest-first ordering");

  assert.deepEqual(
    history.MOOD_HISTORY_PERIODS.map((period) => period.optionLabel),
    ["1주일", "1개월", "3개월", "6개월", "1년"],
  );
  console.log("PASS period options match Figma");

  const indexedDbSource = await readFile(new URL("lib/indexed-db.ts", projectRoot), "utf8");
  const flowSource = await readFile(new URL("components/mood-question-flow.tsx", projectRoot), "utf8");
  assert.match(indexedDbSource, /createIndex\("date", "date", \{ unique: true \}\)/);
  assert.match(indexedDbSource, /const saved: MoodRecord = \{ \.\.\.record, id: record\.date \}/);
  assert.match(indexedDbSource, /objectStore\(MOOD_STORE\)\.put\(saved\)/);
  assert.ok(flowSource.indexOf("await saveMoodRecord") < flowSource.indexOf("window.location.assign"));
  console.log("PASS same-date MoodRecord upsert and navigation-after-commit structure");

  console.log("mood flow fixture cases: 11/11 passed");
} finally {
  await rm(fixtureDirectory, { recursive: true, force: true });
}
