import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const environments = JSON.parse(await readFile('native-environments.json', 'utf8'));
const production = {
  ADDI_NATIVE_STAGE: 'production',
  VITE_NATIVE_STAGE: 'production',
  VITE_NATIVE_SUPABASE_URL: environments.production.supabaseUrl,
  VITE_NATIVE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  VITE_NATIVE_AUTH_CALLBACK: environments.production.callback,
};
function rejected(overrides) {
  const result = spawnSync(process.execPath, ['scripts/configure-auth.mjs'], {
    cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, ...production, ...overrides },
  });
  assert.notEqual(result.status, 0);
}
test('build guard rejects crossed stage, project and callback before Android configuration', () => {
  rejected({ VITE_NATIVE_STAGE: 'development' });
  rejected({ VITE_NATIVE_SUPABASE_URL: environments.development.supabaseUrl });
  rejected({ VITE_NATIVE_AUTH_CALLBACK: 'https://addi-auth-qa.example.com/auth/native/callback' });
  rejected({ NATIVE_DEBUG_SHA256: 'AA:'.repeat(31) + 'AA' });
  rejected({ ADDI_NATIVE_STAGE: 'development' });
});
test('Production App Link is tied to Play signing, not the upload key', async () => {
  const links = JSON.parse(await readFile('../../public/.well-known/assetlinks.json', 'utf8'));
  const app = links.find(entry => entry.target?.package_name === environments.production.package);
  assert.ok(app?.target.sha256_cert_fingerprints.includes(environments.production.playSigningSha256));
  assert.ok(!app?.target.sha256_cert_fingerprints.includes(environments.production.uploadSigningSha256));
});
