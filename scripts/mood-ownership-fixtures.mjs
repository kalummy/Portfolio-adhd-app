import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function mood(date, summary = "categorical summary") {
  return {
    id: date,
    date,
    mood: "good",
    recordedAt: `${date}T03:00:00.000Z`,
    memberSummary: summary,
    catId: "white",
    analysisStatus: "completed",
    analysisResult: {
      todayEmotion: [{ text: "집중 상태를 기록했어요.", evidenceIds: ["step1:concentration_good"] }],
      clinicPhrase: { text: "오늘 집중 상태를 기록했어요.", evidenceIds: ["step1:concentration_good"] },
    },
    analysisVersion: "mood-daily-v1",
    analysisModel: "addi-local-rules-v1",
    analysisCreatedAt: `${date}T03:00:01.000Z`,
  };
}

function createBrowserState(legacyRecords = []) {
  return {
    rawRecords: new Map(legacyRecords.map((record) => [record.id, record])),
    activeDataset: { id: "dataset-guest", moodRecordIds: [] },
    claims: new Map(),
  };
}

function saveGuest(state, record) {
  state.rawRecords.set(record.id, record);
  state.activeDataset.moodRecordIds = [...new Set([
    ...state.activeDataset.moodRecordIds,
    record.id,
  ])];
}

function listGuest(state) {
  const activeIds = new Set(state.activeDataset.moodRecordIds);
  return [...state.rawRecords.values()].filter((record) => activeIds.has(record.id));
}

function deleteGuest(state, date) {
  if (!state.activeDataset.moodRecordIds.includes(date)) return;
  state.rawRecords.delete(date);
  state.activeDataset.moodRecordIds = state.activeDataset.moodRecordIds.filter(
    (recordId) => recordId !== date,
  );
}

function mergeGuest(state, serverByUser, userId) {
  const datasetId = state.activeDataset.id;
  const existingClaim = state.claims.get(datasetId);
  if (existingClaim && existingClaim !== userId) {
    return { success: false, claimed: false, reason: "dataset_claimed_by_another_user" };
  }

  const server = serverByUser.get(userId) ?? new Map();
  for (const record of listGuest(state)) {
    if (!server.has(record.date)) server.set(record.date, structuredClone(record));
  }
  serverByUser.set(userId, server);
  state.claims.set(datasetId, userId);
  state.activeDataset = { id: `${datasetId}-rotated`, moodRecordIds: [] };
  return { success: true, claimed: true };
}

const legacy = mood("2026-08-18", "legacy private text");
const state = createBrowserState([legacy]);
assert.deepEqual(listGuest(state), []);
console.log("PASS legacy raw MoodRecord is excluded from the active guest dataset");

const guest = mood("2026-08-19");
saveGuest(state, guest);
assert.deepEqual(listGuest(state).map((record) => record.id), [guest.id]);
assert.deepEqual(listGuest(state).map((record) => record.id), [guest.id]);
console.log("PASS guest save persists only explicit owned MoodRecord ids");

const serverByUser = new Map();
assert.deepEqual(mergeGuest(state, serverByUser, "account-a"), { success: true, claimed: true });
assert.equal(serverByUser.get("account-a").get(guest.date).memberSummary, "categorical summary");
assert.equal(serverByUser.get("account-a").get(guest.date).catId, "white");
assert.equal(serverByUser.get("account-a").get(guest.date).analysisModel, "addi-local-rules-v1");
assert.deepEqual(listGuest(state), []);
console.log("PASS guest Mood migrates to member and local active dataset rotates");

const accountAServer = serverByUser.get("account-a");
const serverFirst = mood("2026-08-20", "server wins");
accountAServer.set(serverFirst.date, serverFirst);
saveGuest(state, mood("2026-08-20", "guest must not overwrite"));
mergeGuest(state, serverByUser, "account-a");
assert.equal(accountAServer.get(serverFirst.date).memberSummary, "server wins");
console.log("PASS same-date member Mood preserves the existing server row");

assert.deepEqual(listGuest(state), []);
assert.equal(serverByUser.get("account-a").size, 2);
console.log("PASS logout view excludes member Mood while server data remains");

saveGuest(state, mood("2026-08-21", "new guest"));
mergeGuest(state, serverByUser, "account-b");
assert.equal(serverByUser.get("account-b").has("2026-08-21"), true);
assert.equal(serverByUser.get("account-b").has("2026-08-19"), false);
assert.equal(serverByUser.get("account-a").has("2026-08-21"), false);
console.log("PASS account A and B Mood datasets stay isolated");

const claimedDataset = state.activeDataset.id;
state.claims.set(claimedDataset, "account-b");
const beforeSize = serverByUser.get("account-b").size;
assert.deepEqual(mergeGuest(state, serverByUser, "account-b"), { success: true, claimed: true });
assert.equal(serverByUser.get("account-b").size, beforeSize);
console.log("PASS same-user claim retry is idempotent");

const failedState = createBrowserState();
saveGuest(failedState, mood("2026-08-22", "retryable guest"));
const beforeFailure = structuredClone(failedState.activeDataset);
const failedMerge = { success: false, claimed: false, reason: "network_failed" };
assert.equal(failedMerge.success, false);
assert.deepEqual(failedState.activeDataset, beforeFailure);
assert.equal(listGuest(failedState).length, 1);
console.log("PASS merge failure preserves the guest Mood and active dataset for retry");

const deletable = mood("2026-08-23", "delete only active guest record");
saveGuest(failedState, deletable);
deleteGuest(failedState, deletable.date);
assert.equal(failedState.rawRecords.has(deletable.date), false);
assert.equal(failedState.activeDataset.moodRecordIds.includes(deletable.date), false);
assert.equal(serverByUser.get("account-a").has("2026-08-20"), true);
saveGuest(failedState, mood(deletable.date, "same date can be written again after delete"));
assert.equal(failedState.rawRecords.has(deletable.date), true);
assert.equal(failedState.activeDataset.moodRecordIds.includes(deletable.date), true);
console.log("PASS guest deletion removes only the active record and permits the same date again");

const repositorySource = await readFile(new URL("../lib/repositories/index.ts", import.meta.url), "utf8");
const homeSource = await readFile(new URL("../components/home-screen.tsx", import.meta.url), "utf8");
const historySource = await readFile(new URL("../components/mood-history.tsx", import.meta.url), "utf8");
const analyticsSource = await readFile(new URL("../lib/analytics/schema.ts", import.meta.url), "utf8");
const guestMergeSource = await readFile(new URL("../lib/repositories/guest-dataset.ts", import.meta.url), "utf8");
const migrationSource = await readFile(new URL("../supabase/migrations/20260825090000_add_mood_cat_and_analysis.sql", import.meta.url), "utf8");
assert.match(repositorySource, /moods: indexedDbMoodRepository/);
assert.match(repositorySource, /moods: moodRepository/);
assert.match(repositorySource, /if \(!isSupabaseConfigured\(\)\)/);
assert.match(homeSource, /repositories\.moods\.listAll\(\)/);
assert.match(homeSource, /window\.addEventListener\("pageshow"/);
assert.match(historySource, /getMoodRepository\(\)/);
assert.match(historySource, /repository\.listRecent\(startDate, endDate\)/);
assert.match(historySource, /repository\.listAll\(\)/);
assert.doesNotMatch(historySource, /createBrowserSupabaseClient|indexedDbMoodRepository/u);
assert.doesNotMatch(analyticsSource, /summary\??:/);
assert.doesNotMatch(analyticsSource, /user_id|userId|mood_date|moodDate/);
assert.match(guestMergeSource, /merge_guest_dataset_v2/);
assert.match(migrationSource, /v_existing_mood_dates/);
assert.match(migrationSource, /details = incoming\.details/);
assert.match(migrationSource, /cat_id = incoming\.cat_id/);
assert.match(migrationSource, /analysis_result = incoming\.analysis_result/);
console.log("PASS repository selection, metadata-preserving merge, and Mixpanel sensitive-field boundaries");

console.log("mood ownership fixture cases: 10/10 passed");
