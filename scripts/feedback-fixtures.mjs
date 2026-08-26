import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = new URL("../", import.meta.url);
const projectRootPath = fileURLToPath(projectRoot);
const fixtureDirectory = await mkdtemp(join(tmpdir(), "addi-feedback-fixtures-"));

try {
  execFileSync(join(projectRootPath, "node_modules/.bin/tsc"), [
    "--ignoreConfig",
    "--target", "es2022",
    "--module", "es2022",
    "--moduleResolution", "bundler",
    "--skipLibCheck",
    "--outDir", fixtureDirectory,
    "lib/feedback.ts",
  ], { cwd: projectRootPath, stdio: "pipe" });
  await writeFile(join(fixtureDirectory, "package.json"), '{"type":"module"}');
  const feedback = await import(pathToFileURL(join(fixtureDirectory, "feedback.js")));

  assert.equal(feedback.normalizeFeedbackText(""), null);
  assert.equal(feedback.normalizeFeedbackText("   \n\t"), null);
  assert.equal(feedback.normalizeFeedbackText("  좋은 서비스예요.  "), "좋은 서비스예요.");
  assert.equal(feedback.normalizeFeedbackText("가".repeat(feedback.FEEDBACK_MAX_LENGTH)), "가".repeat(feedback.FEEDBACK_MAX_LENGTH));
  assert.equal(feedback.normalizeFeedbackText("가".repeat(feedback.FEEDBACK_MAX_LENGTH + 1)), null);
  assert.equal(feedback.normalizeFeedbackText({ feedback: "blocked" }), null);

  const migration = await readFile(
    new URL("../supabase/migrations/20260826043217_create_feedback.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /grant insert on table public\.feedback to anon, authenticated;/u);
  assert.match(migration, /to anon\s+with check \(user_id is null\)/u);
  assert.match(migration, /to authenticated\s+with check \(\(select auth\.uid\(\)\) = user_id\)/u);
  assert.doesNotMatch(migration, /grant select/u);
  assert.doesNotMatch(migration, /auth_state/u);
  assert.doesNotMatch(migration, /mood|medication|visit|cat_id/u);

  const screen = await readFile(
    new URL("../components/feedback-screen.tsx", import.meta.url),
    "utf8",
  );
  const route = await readFile(
    new URL("../app/api/feedback/route.ts", import.meta.url),
    "utf8",
  );
  const mixpanel = await readFile(
    new URL("../lib/analytics/mixpanel.ts", import.meta.url),
    "utf8",
  );
  assert.match(screen, /submittingRef\.current/u);
  assert.match(screen, /disabled=\{!normalizedFeedback \|\| submitting\}/u);
  assert.match(screen, /sessionStorage\.removeItem\(FEEDBACK_DRAFT_SESSION_KEY\)/u);
  assert.doesNotMatch(screen, /analytics|mixpanel|console\./iu);
  assert.doesNotMatch(route, /console\.|feedbackText[^\n]*Response\.json/iu);
  assert.match(screen, /className="feedback-private-input"/u);
  assert.match(mixpanel, /record_block_selector: "\.feedback-private-input"/u);
  assert.match(mixpanel, /record_sessions_percent: 0/u);

  console.log("PASS feedback validation, duplicate guard, privacy, and RLS fixture");
} finally {
  await rm(fixtureDirectory, { recursive: true, force: true });
}
