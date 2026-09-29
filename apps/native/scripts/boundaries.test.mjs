import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const base='1eac31aee1c7b3f3d16c17a35252268f67669a31';
test('packaged shell stays bundled with the selected Native transport only', async () => {
  const config=JSON.parse(await readFile('android/app/src/main/assets/capacitor.config.json','utf8'));
  const properties=await readFile('android/native-auth.properties','utf8');
  const production=properties.includes('nativeStage=production');
  assert.match(await readFile('android/app/build.gradle','utf8'), /debug \{[\s\S]*applicationIdSuffix \"\.dev\"/);
  assert.equal(config.appId,production?'com.addi.app':'com.addi.app.dev'); assert.equal(config.server?.url,undefined);
  assert.equal(config.server?.allowNavigation,undefined); assert.equal(config.loggingBehavior,'none');
  const assets=await readdir('dist'); assert.ok(!assets.includes('sw.js')); assert.ok(!assets.includes('manifest.webmanifest'));
  const html=await readFile('dist/index.html','utf8');
  assert.ok(html.includes(production?'https://joffvlsyxivveqycjrio.supabase.co':'https://ohobxicxchkaisxxswkk.supabase.co'));
  assert.ok(!html.includes(production?'https://ohobxicxchkaisxxswkk.supabase.co':'https://joffvlsyxivveqycjrio.supabase.co'));
  for(const file of await readdir('dist/assets')) {
    if(!file.endsWith('.js')) continue;
    const code=await readFile(`dist/assets/${file}`,'utf8');
    assert.equal(code.includes(production?'ohobxicxchkaisxxswkk':'joffvlsyxivveqycjrio'), false, 'Wrong Supabase project in bundle');
    assert.equal(/sb_secret_[A-Za-z0-9]{20}/.test(code), false, 'Secret in bundle');
  }
});
test('web Google/Kakao, cookie callback, DAL, TWA, CSS, API and Web Push byte-preserved', async () => {
  for(const path of ['lib/auth/client.ts','app/auth/callback/route.ts','lib/supabase/client.ts','lib/supabase/server.ts','lib/supabase/proxy.ts','public/.well-known/assetlinks.json','android/app/src/main/AndroidManifest.xml','app/globals.css','lib/push/client.ts','lib/push/server.ts','public/sw.js','app/manifest.ts','lib/reminders/policy.ts','lib/reminders/scheduler.ts']) {
    assert.equal(await readFile(`../../${path}`,'utf8'),execFileSync('git',['show',`${base}:${path}`],{encoding:'utf8'}),path);
  }

});
test('stage-selected release, exact callback, Firebase and backup guards', async () => {
  const gradle=await readFile('android/app/build.gradle','utf8');
  assert.match(gradle,/withBuildType\("release"\)[\s\S]*variant.enable = nativeStage == 'production'/);
  assert.match(gradle,/Upload certificate does not match Play upload identity/);
  assert.match(gradle,/Native Firebase Android client mismatch/);
  const manifest=await readFile('android/app/src/main/AndroidManifest.xml','utf8');
  assert.match(manifest,/POST_NOTIFICATIONS/);
  assert.doesNotMatch(manifest,/DelegationService/);
  assert.match(gradle,/src\/release\/google-services.json/);
  assert.match(manifest,/allowBackup="false"/); assert.match(manifest,/android:path="\/auth\/native\/callback"/);
  const activity=await readFile('android/app/src/main/java/com/addi/app/MainActivity.java','utf8');
  assert.match(activity,/return !isLocal\(request.getUrl\(\)\)/);
  assert.doesNotMatch(activity,/TrustedWebActivity/);
});
