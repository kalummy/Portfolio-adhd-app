import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = new URL("../", import.meta.url);
const rootPath = fileURLToPath(projectRoot);
const fixtureDirectory = await mkdtemp(join(tmpdir(), "addi-guest-visibility-"));

try {
  execFileSync(join(rootPath, "node_modules/.bin/tsc"), [
    "--ignoreConfig", "--target", "es2022", "--module", "es2022", "--moduleResolution", "bundler",
    "--skipLibCheck", "--outDir", fixtureDirectory, "lib/guest-dataset-visibility.ts",
  ], { cwd: rootPath, stdio: "pipe" });
  await writeFile(join(fixtureDirectory, "package.json"), '{"type":"module"}');
  const visibility = await import(pathToFileURL(join(fixtureDirectory, "guest-dataset-visibility.js")));
  const claims = [
    { claimedUserId: "user-a", claimedAt: "2026-08-20T00:00:00Z", medicationIds: ["med-a"], intakeRecordIds: ["intake-a"], moodRecordIds: ["mood-a"], visitSchedule: { id: "visit-a" } },
    { claimedUserId: "user-b", claimedAt: "2026-08-21T00:00:00Z", medicationIds: ["med-b"], intakeRecordIds: ["intake-b"], moodRecordIds: ["mood-b"] },
  ];
  assert.deepEqual(visibility.getVisibleGuestRecordIds(["med-new"], claims, "user-a", "medicationIds"), ["med-new", "med-a"]);
  assert.deepEqual(visibility.getVisibleGuestRecordIds([], claims, "user-a", "moodRecordIds"), ["mood-a"]);
  assert.deepEqual(visibility.getVisibleGuestRecordIds([], claims, "user-b", "intakeRecordIds"), ["intake-b"]);
  assert.deepEqual(visibility.getVisibleGuestRecordIds([], claims, undefined, "medicationIds"), []);
  const authSource = await readFile(new URL("components/auth-login-screen.tsx", projectRoot), "utf8");
  assert.match(authSource, /handleSignOut[\s\S]*await restoreClaimedGuestDatasetVisibilityForUser\(authState\.user\.id\)[\s\S]*await signOut\(\)/u);
  console.log("guest logout visibility fixture cases: 5/5 passed");
} finally {
  await rm(fixtureDirectory, { recursive: true, force: true });
}
