import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AccountDeletionError,
  deleteAuthenticatedAccount,
} from "../lib/account-deletion.ts";
import {
  isAddiOwnedStorageKey,
  removeAddiOwnedStorageKeys,
} from "../lib/addi-storage.ts";
import { getSafeNextPath } from "../lib/auth/redirect.ts";

const calls = [];
await deleteAuthenticatedAccount({
  getCurrentUser: async () => ({ user: { id: "current-user" }, error: null }),
  deleteFeedback: async (userId) => {
    calls.push(["feedback", userId]);
    return { error: null };
  },
  deleteAuthUser: async (userId) => {
    calls.push(["auth", userId]);
    return { error: null };
  },
}, { userId: "attacker-controlled-user" });
assert.deepEqual(calls, [
  ["feedback", "current-user"],
  ["auth", "current-user"],
]);

let unauthenticatedDeleteCalled = false;
await assert.rejects(
  deleteAuthenticatedAccount({
    getCurrentUser: async () => ({ user: null, error: null }),
    deleteFeedback: async () => {
      unauthenticatedDeleteCalled = true;
      return { error: null };
    },
    deleteAuthUser: async () => {
      unauthenticatedDeleteCalled = true;
      return { error: null };
    },
  }),
  (error) => error instanceof AccountDeletionError && error.code === "unauthorized",
);
assert.equal(unauthenticatedDeleteCalled, false);

let authDeleteAfterFeedbackFailure = false;
await assert.rejects(
  deleteAuthenticatedAccount({
    getCurrentUser: async () => ({ user: { id: "current-user" }, error: null }),
    deleteFeedback: async () => ({ error: new Error("feedback_failed") }),
    deleteAuthUser: async () => {
      authDeleteAfterFeedbackFailure = true;
      return { error: null };
    },
  }),
  (error) => error instanceof AccountDeletionError
    && error.code === "feedback_delete_failed",
);
assert.equal(authDeleteAfterFeedbackFailure, false);

await assert.rejects(
  deleteAuthenticatedAccount({
    getCurrentUser: async () => ({ user: { id: "current-user" }, error: null }),
    deleteFeedback: async () => ({ error: null }),
    deleteAuthUser: async () => ({ error: new Error("auth_failed") }),
  }),
  (error) => error instanceof AccountDeletionError && error.code === "auth_delete_failed",
);

const backingKeys = [
  "addi:feedback:draft",
  "addi-medication-registration-draft",
  "unrelated-service-key",
];
const removedKeys = [];
const storage = {
  get length() {
    return backingKeys.length;
  },
  key(index) {
    return backingKeys[index] ?? null;
  },
  removeItem(key) {
    removedKeys.push(key);
  },
};
assert.equal(isAddiOwnedStorageKey("addi:analytics:intake-dedupe:v1"), true);
assert.equal(isAddiOwnedStorageKey("addi-photo-capture-retry"), true);
assert.equal(isAddiOwnedStorageKey("mp_device_id"), false);
assert.deepEqual(removeAddiOwnedStorageKeys(storage), [
  "addi:feedback:draft",
  "addi-medication-registration-draft",
]);
assert.deepEqual(removedKeys, [
  "addi:feedback:draft",
  "addi-medication-registration-draft",
]);

const routeSource = await readFile(new URL("../app/api/account/route.ts", import.meta.url), "utf8");
const adminSource = await readFile(new URL("../lib/supabase/admin.ts", import.meta.url), "utf8");
const localSource = await readFile(new URL("../lib/account-deletion-local.ts", import.meta.url), "utf8");
const indexedDbSource = await readFile(new URL("../lib/indexed-db.ts", import.meta.url), "utf8");
const analyticsSource = await readFile(new URL("../lib/analytics/mixpanel.ts", import.meta.url), "utf8");
const authRoutesSource = await readFile(new URL("../lib/auth/routes.ts", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../app/delete-account/page.tsx", import.meta.url), "utf8");
const publicScreenSource = await readFile(new URL("../components/public-account-deletion.tsx", import.meta.url), "utf8");

assert.match(routeSource, /sessionClient\.auth\.getUser\(\)/u);
assert.doesNotMatch(routeSource, /request\.json\(/u);
assert.match(routeSource, /\.eq\("user_id", userId\)/u);
assert.match(routeSource, /auth\.admin\.deleteUser\(userId, false\)/u);
assert.match(routeSource, /origin === new URL\(request\.url\)\.origin/u);
assert.match(adminSource, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/u);
assert.doesNotMatch(adminSource, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/u);
assert.match(localSource, /window\.localStorage/u);
assert.match(localSource, /window\.sessionStorage/u);
assert.match(localSource, /clearAddiIndexedDatabase\(\)/u);
assert.match(indexedDbSource, /indexedDB\.deleteDatabase\(DB_NAME\)/u);
assert.match(analyticsSource, /mixpanel\.reset\(\)/u);
assert.match(authRoutesSource, /SELF_AUTHENTICATING_API_PATHS = \["\/api\/account"\]/u);
assert.match(authRoutesSource, /PUBLIC_PAGE_PATHS = \[[^\]]*"\/delete-account"/u);
assert.match(pageSource, /title: "ADDI 계정 삭제"/u);
assert.match(pageSource, /await connection\(\)/u);
assert.match(publicScreenSource, /signInWithGoogle\(DELETE_ACCOUNT_PATH\)/u);
assert.match(publicScreenSource, /signInWithKakao\(DELETE_ACCOUNT_PATH\)/u);
assert.match(publicScreenSource, /fetch\("\/api\/account", \{/u);
assert.match(publicScreenSource, /method: "DELETE"/u);
assert.doesNotMatch(publicScreenSource, /body:/u);
assert.match(publicScreenSource, /clearDeletedAccountLocalData\(\)/u);
assert.match(publicScreenSource, /clearDeletedAccountSession\(\)/u);
assert.match(publicScreenSource, /ADDI 계정이 삭제되었습니다\./u);
assert.match(publicScreenSource, /계정 삭제에 실패했습니다\. 잠시 후 다시 시도해주세요\./u);
assert.match(publicScreenSource, /현재 브라우저에 저장된 ADDI 관련 사용자 기록/u);
assert.equal(getSafeNextPath("/delete-account"), "/delete-account");
assert.equal(getSafeNextPath("https://attacker.invalid/delete-account"), "/");
assert.equal(getSafeNextPath("//attacker.invalid/delete-account"), "/");
assert.equal(getSafeNextPath("/\\attacker.invalid/delete-account"), "/");

console.log("account deletion fixtures: PASS");
