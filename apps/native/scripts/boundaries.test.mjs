import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

test('packaged shell is local and contains no web runtime or credentials', async () => {
  const config = JSON.parse(await readFile('android/app/src/main/assets/capacitor.config.json', 'utf8'));
  assert.equal(config.appId, 'com.addi.app');
  assert.equal(config.server?.url, undefined);
  assert.equal(config.server?.allowNavigation, undefined);
  const assets = await readdir('dist');
  assert.ok(!assets.includes('sw.js'));
  assert.ok(!assets.includes('manifest.webmanifest'));
  for (const file of await readdir('dist/assets')) {
    if (!file.endsWith('.js')) continue;
    const code = await readFile(`dist/assets/${file}`, 'utf8');
    assert.doesNotMatch(code, /https:\/\/[^"\s]+\.supabase\.co|addi-gamma\.vercel\.app|NEXT_PUBLIC_SUPABASE|service_role|createBrowserSupabaseClient|api\.mixpanel\.com/);
  }
});

test('Phase 1 diff cannot change web runtime, TWA, Push, server or DB files', () => {
  const paths = execFileSync('git', ['diff', '--name-only', '65cd794710e151f748bdb11041d2de0adb5abfe0'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  assert.ok(paths.every(path => path === 'tsconfig.json' || path.startsWith('apps/native/')), paths.join('\n'));
});

test('release variant is disabled and native external navigation is blocked', async () => {
  assert.match(await readFile('android/app/build.gradle', 'utf8'), /withBuildType\("release"\)[\s\S]*variant.enable = false/);
  const manifest = await readFile('android/app/src/main/AndroidManifest.xml', 'utf8');
  assert.doesNotMatch(manifest, /BROWSABLE|POST_NOTIFICATIONS|Firebase|DelegationService/);
  assert.match(manifest, /allowBackup="false"/);
  const activity = await readFile('android/app/src/main/java/com/addi/app/MainActivity.java', 'utf8');
  assert.match(activity, /return !isLocal\(request.getUrl\(\)\)/);
  assert.doesNotMatch(activity, /startActivity|CustomTabs|TrustedWebActivity/);
});
