import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const base='1eac31aee1c7b3f3d16c17a35252268f67669a31';
test('packaged shell stays bundled, with logging disabled and Dev-only transport', async () => {
  const config=JSON.parse(await readFile('android/app/src/main/assets/capacitor.config.json','utf8'));
  assert.match(await readFile('android/app/build.gradle','utf8'), /debug \{[\s\S]*applicationIdSuffix \"\.dev\"/);
  assert.equal(config.appId,'com.addi.app.dev'); assert.equal(config.server?.url,undefined);
  assert.equal(config.server?.allowNavigation,undefined); assert.equal(config.loggingBehavior,'none');
  const assets=await readdir('dist'); assert.ok(!assets.includes('sw.js')); assert.ok(!assets.includes('manifest.webmanifest'));
  for(const file of await readdir('dist/assets')) {
    if(!file.endsWith('.js')) continue;
    const code=await readFile(`dist/assets/${file}`,'utf8');
    assert.equal(/joffvlsyxivveqycjrio|api\.mixpanel\.com|sb_secret_[A-Za-z0-9]{20}/.test(code), false, 'Unexpected production transport or secret');
  }
});
test('web Google/Kakao, cookie callback, DAL, TWA, CSS, API and Web Push byte-preserved', async () => {
  for(const path of ['lib/auth/client.ts','app/auth/callback/route.ts','lib/supabase/client.ts','lib/supabase/server.ts','lib/supabase/proxy.ts','public/.well-known/assetlinks.json','android/app/src/main/AndroidManifest.xml','app/globals.css','lib/push/client.ts','lib/push/server.ts','public/sw.js','app/manifest.ts','lib/reminders/policy.ts','lib/reminders/scheduler.ts','app/api/cron/reminders/route.ts']) {
    assert.equal(await readFile(`../../${path}`,'utf8'),execFileSync('git',['show',`${base}:${path}`],{encoding:'utf8'}),path);
  }

});
test('release disabled, exact HTTPS callback, Dev FCM only, backup excluded', async () => {
  assert.match(await readFile('android/app/build.gradle','utf8'),/withBuildType\("release"\)[\s\S]*variant.enable = false/);
  const manifest=await readFile('android/app/src/main/AndroidManifest.xml','utf8');
  assert.match(manifest,/POST_NOTIFICATIONS/);
  assert.doesNotMatch(manifest,/DelegationService/);
  assert.match(await readFile('android/app/build.gradle','utf8'),/addi-503b5/);
  assert.match(manifest,/allowBackup="false"/); assert.match(manifest,/android:path="\/auth\/native\/callback"/);
  const activity=await readFile('android/app/src/main/java/com/addi/app/MainActivity.java','utf8');
  assert.match(activity,/return !isLocal\(request.getUrl\(\)\)/);
  assert.doesNotMatch(activity,/TrustedWebActivity/);
});
