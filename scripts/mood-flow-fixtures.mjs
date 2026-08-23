import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = new URL("../", import.meta.url);
const rootPath = fileURLToPath(projectRoot);
const fixtureDirectory = await mkdtemp(join(tmpdir(), "addi-mood-fixtures-"));

try {
  execFileSync(join(rootPath, "node_modules/.bin/tsc"), [
    "--ignoreConfig", "--target", "es2022", "--module", "es2022", "--moduleResolution", "bundler",
    "--skipLibCheck", "--outDir", fixtureDirectory, "lib/types.ts", "lib/visit-date.ts", "lib/mood-history.ts", "lib/mood-summary.ts", "lib/mood-draft.ts",
  ], { cwd: rootPath, stdio: "pipe" });
  await copyFile(join(fixtureDirectory, "visit-date.js"), join(fixtureDirectory, "visit-date"));
  await copyFile(join(fixtureDirectory, "types.js"), join(fixtureDirectory, "types"));
  await copyFile(join(fixtureDirectory, "mood-summary.js"), join(fixtureDirectory, "mood-summary"));
  await writeFile(join(fixtureDirectory, "package.json"), '{"type":"module"}');

  const history = await import(pathToFileURL(join(fixtureDirectory, "mood-history.js")));
  const summary = await import(pathToFileURL(join(fixtureDirectory, "mood-summary.js")));
  const draft = await import(pathToFileURL(join(fixtureDirectory, "mood-draft.js")));
  const answer = (selected = [], customText = "", timingsByOption = {}) => ({ selected, customText, timingsByOption });
  const recordedAt = "2026-08-24T02:00:00.000Z";

  const result = summary.buildMoodSummary([
    answer(["weak"], "", { weak: ["점심", "저녁"] }),
    answer(["irritable", "sleep"]),
    answer(["task"]),
  ], recordedAt);
  assert.equal(result.checkItems.length, 3);
  assert.match(result.checkItems[0], /점심·저녁/u);
  assert.match(result.checkItems[1], /예민·수면 문제/u);
  assert.equal(result.clinicPhrase, "점심·저녁엔 약효가 약했고 예민·수면이 있었어요. 업무 집중이 어려웠어요.");
  assert.doesNotMatch(result.clinicPhrase, /부작용|진단|발생/u);
  assert.deepEqual(result.details.medicationEffectTimings.weak, ["점심", "저녁"]);
  console.log("PASS deterministic summary remains observation-based and preserves timing");

  const concise = summary.buildMoodSummary([
    answer(["weak", "similar"], "", { weak: ["점심"] }),
    answer(["sleep", "hyperfocus"]),
    answer(["conversation", "unfinished"]),
  ], recordedAt);
  assert.equal(concise.clinicPhrase, "점심엔 약효가 약했고 수면·과몰입이 있었어요. 대화·일 마무리가 어려웠어요.");
  assert.equal(concise.clinicPhrase.split(".").filter(Boolean).length, 2);
  assert.ok(concise.clinicPhrase.length <= 50);
  assert.doesNotMatch(concise.clinicPhrase, /평소와 비슷/u);
  console.log("PASS clinic phrase compresses overlapping selections into two short sentences");

  const custom = summary.buildMoodSummary([
    answer(["custom"], "오전에 멍한 느낌"), answer(["custom"], "마음이 편안했어요"), answer(["none"]),
  ], recordedAt);
  assert.match(custom.checkItems.join(" "), /오전에 멍한 느낌/u);
  assert.equal(custom.details.customText.mood, "마음이 편안했어요");
  console.log("PASS selected custom text is preserved without a length cap");

  const moodRecord = (date, details) => ({
    id: date, date, mood: "irritable", moodLabel: "화가 나고 예민해요", recordedAt: `${date}T12:00:00+09:00`,
    diaryEntries: [date], clinicPhrase: `${date} 관찰`, details,
  });
  const details = result.details;
  const records = [moodRecord("2026-08-24", details), moodRecord("2026-08-20", details), moodRecord("2026-08-01", details)];
  const today = new Date(2026, 7, 24, 12);
  const filtered = history.filterMoodRecordsByPeriod(records, "14d", today);
  assert.deepEqual(filtered.map((record) => record.date), ["2026-08-24", "2026-08-20"]);
  const stats = history.buildMoodHistoryStats(filtered);
  assert.equal(stats.uniqueDays, 2);
  assert.equal(stats.effectRecordedDays, 2);
  assert.equal(stats.relationshipDifficultDays, 2);
  assert.deepEqual(history.MOOD_HISTORY_PERIODS.map((period) => period.optionLabel), ["14일", "1개월", "3개월"]);
  assert.ok(stats.patterns.every((pattern) => pattern.count >= 2));
  console.log("PASS 14-day filtering and history metrics use actual structured records");

  const oneRecordStats = history.buildMoodHistoryStats([records[0]]);
  assert.equal(oneRecordStats.uniqueDays, 1);
  assert.deepEqual(oneRecordStats.patterns, []);
  assert.doesNotMatch(oneRecordStats.clinicPhrase, /반복|지속/u);
  const threeRecordStats = history.buildMoodHistoryStats(records);
  assert.match(threeRecordStats.clinicPhrase, /반복해서/u);
  console.log("PASS history starts at one record and only exposes repeated patterns at policy thresholds");

  const flowSource = await readFile(new URL("components/mood-question-flow.tsx", projectRoot), "utf8");
  assert.match(flowSource, /MOOD_QUESTIONS\.map/);
  assert.match(flowSource, /window\.history\.pushState/);
  assert.match(flowSource, /window\.history\.back\(\)/);
  assert.match(flowSource, /title="감정 기록을 중단할까요\?"/);
  assert.match(flowSource, /가장 가까운 항목을 선택해주세요\./);
  assert.match(flowSource, /window\.sessionStorage/);
  assert.match(flowSource, /clearMoodDraft/);
  assert.match(flowSource, /destination\.searchParams\.set\("moodToast", "saved"\)/);
  assert.match(flowSource, /destination\.searchParams\.set\("toastId", createClientId\(\)\)/);
  assert.match(flowSource, /new URL\(homeHref, window\.location\.origin\)/);
  assert.ok(flowSource.indexOf("await repository.save") < flowSource.lastIndexOf("window.location.assign"));
  console.log("PASS three-step navigation, close confirmation, and navigation-after-save structure");

  const storageMap = new Map();
  const storage = {
    getItem: (key) => storageMap.get(key) ?? null,
    setItem: (key, value) => storageMap.set(key, value),
    removeItem: (key) => storageMap.delete(key),
  };
  const draftAnswers = [answer(["similar"]), answer(["anxious"]), answer(["none"])];
  draft.writeMoodDraft(storage, "2026-08-23", { phase: "questions", step: 1, answers: draftAnswers });
  draft.writeMoodDraft(storage, "2026-08-24", { phase: "result", step: 2, answers: draftAnswers });
  assert.equal(draft.getMoodDraftKey("2026-08-24"), "addi:mood-draft:2026-08-24");
  assert.deepEqual(draft.readMoodDraft(storage, "2026-08-24"), {
    version: 1, phase: "result", step: 2, answers: draftAnswers,
  });
  assert.equal(draft.readMoodDraft(storage, "2026-08-23")?.step, 1);
  draft.clearMoodDraft(storage, "2026-08-24");
  assert.equal(draft.readMoodDraft(storage, "2026-08-24"), null);
  assert.equal(draft.readMoodDraft(storage, "2026-08-23")?.answers[0].selected[0], "similar");
  const pageSource = await readFile(new URL("app/moods/new/page.tsx", projectRoot), "utf8");
  assert.match(pageSource, /key=\{targetDateKey\}/);
  assert.match(flowSource, /buildMoodSummary\(draft\.answers/);
  console.log("PASS sessionStorage mood drafts are versioned, restorable, clearable, and date-scoped");

  const loadingSource = await readFile(new URL("components/mood-summary-loading.tsx", projectRoot), "utf8");
  const loadingPrototypeSource = await readFile(new URL("components/mood-loading-prototype.tsx", projectRoot), "utf8");
  const lottieSource = await readFile(new URL("components/mood-lottie.tsx", projectRoot), "utf8");
  const resultSource = await readFile(new URL("components/mood-result.tsx", projectRoot), "utf8");
  assert.match(loadingSource, /MoodLoadingPrototype/);
  assert.match(loadingSource, /MoodLottiePreloader/);
  assert.match(loadingPrototypeSource, /mood-loading-start\.svg/);
  assert.match(loadingPrototypeSource, /mood-loading-end\.svg/);
  assert.match(loadingPrototypeSource, /onAnimationEnd/);
  assert.match(lottieSource, /lottieCache/);
  assert.match(lottieSource, /lottie\.loadAnimation/);
  assert.match(lottieSource, /renderer: "svg"/);
  assert.match(lottieSource, /autoplay: true/);
  assert.match(lottieSource, /animation\?\.destroy\(\)/);
  assert.match(lottieSource, /preserveAspectRatio: "xMidYMid meet"/);
  assert.doesNotMatch(lottieSource, /from "lottie-react"|prefers-reduced-motion/u);
  assert.match(resultSource, /\/lottie\/mood-complete\.json/);
  assert.match(resultSource, /navigator\.share/);
  assert.doesNotMatch(`${flowSource}\n${loadingSource}\n${lottieSource}\n${resultSource}`, /Check\.json|SUMMARY_DURATION_MS|6000/);
  console.log("PASS Loading uses the Figma prototype and Result uses the dedicated completion JSON plus native sharing");

  console.log("mood flow fixture cases: 8/8 passed");
} finally {
  await rm(fixtureDirectory, { recursive: true, force: true });
}
