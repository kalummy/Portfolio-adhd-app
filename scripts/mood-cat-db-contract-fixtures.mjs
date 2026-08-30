import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const EXPECTED_CAT_IDS = [
  "white",
  "calico",
  "tuxedo",
  "rainbow",
  "sunglasses",
  "winter",
  "party",
  "whats-up",
  "tube",
  "graduation",
  "nerd",
];

const migrationPath = new URL(
  "../supabase/migrations/20260830070436_sync_mood_cat_catalog_allowlist.sql",
  import.meta.url,
);
const catalogPath = new URL("../lib/cats.ts", import.meta.url);

const [migration, catalog] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(catalogPath, "utf8"),
]);

function extractQuotedValues(source) {
  return Array.from(source.matchAll(/'([^']+)'/g), (match) => match[1]);
}

function extractCatalogIds(source) {
  const catalogBlock = source.match(
    /export const REWARD_CAT_CATALOG = \[([\s\S]*?)\] as const;/,
  )?.[1];
  assert.ok(catalogBlock, "REWARD_CAT_CATALOG를 찾지 못했습니다.");
  return Array.from(catalogBlock.matchAll(/\{ id: "([^"]+)"/g), (match) => match[1]);
}

function extractAllowlist(source, pattern, label) {
  const allowlist = source.match(pattern)?.[1];
  assert.ok(allowlist, `${label} allowlist를 찾지 못했습니다.`);
  return extractQuotedValues(allowlist);
}

const catalogIds = extractCatalogIds(catalog);
const constraintIds = extractAllowlist(
  migration,
  /add constraint mood_records_cat_id_check[\s\S]*?cat_id in \(([\s\S]*?)\)\s*\)\s*;/,
  "mood_records_cat_id_check",
);
const guestValidatorIds = extractAllowlist(
  migration,
  /v_mood\.cat_id not in \(([\s\S]*?)\)\s*\n\s*\)/,
  "merge_guest_dataset_v2",
);

assert.deepEqual(catalogIds, EXPECTED_CAT_IDS, "앱 Cat catalog가 승인된 11종과 다릅니다.");
assert.deepEqual(
  constraintIds,
  catalogIds,
  "DB constraint allowlist가 앱 Cat catalog와 다릅니다.",
);
assert.deepEqual(
  guestValidatorIds,
  catalogIds,
  "guest merge validator allowlist가 앱 Cat catalog와 다릅니다.",
);
assert.match(
  migration,
  /drop constraint mood_records_cat_id_check;/,
  "기존 mood_records_cat_id_check를 명시적으로 교체해야 합니다.",
);
assert.match(
  migration,
  /cat_id is null\s+or cat_id in/,
  "constraint는 NULL 또는 정확한 allowlist만 허용해야 합니다.",
);
assert.ok(!catalogIds.includes("invalid-cat"));
assert.ok(!constraintIds.includes("invalid-cat"));
assert.ok(!guestValidatorIds.includes("invalid-cat"));

console.log("Mood Cat DB contract fixtures passed.");
