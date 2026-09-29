import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const base='1eac31aee1c7b3f3d16c17a35252268f67669a31';
test('packaged Dev shell stays bundled, with logging disabled', async () => {
  const config=JSON.parse(await readFile('android/app/src/main/assets/capacitor.config.json','utf8'));
  assert.match(await readFile('android/app/build.gradle','utf8'), /debug \{[\s\S]*applicationIdSuffix \"\.dev\"/);
  assert.equal(config.appId,'com.addi.app.dev'); assert.equal(config.server?.url,undefined);
  assert.equal(config.server?.allowNavigation,undefined); assert.equal(config.loggingBehavior,'none');
  const assets=await readdir('dist'); assert.ok(!assets.includes('sw.js')); assert.ok(!assets.includes('manifest.webmanifest'));
  for(const file of await readdir('dist/assets')) {
    if(!file.endsWith('.js')) continue;
    const code=await readFile(`dist/assets/${file}`,'utf8');
    assert.equal(/sb_secret_[A-Za-z0-9]{20}/.test(code), false, 'Unexpected secret');
  }
});
test('web Google/Kakao, cookie callback, DAL, TWA, API and Web Push byte-preserved', async () => {
  for(const path of ['lib/auth/client.ts','app/auth/callback/route.ts','lib/supabase/client.ts','lib/supabase/server.ts','lib/supabase/proxy.ts','public/.well-known/assetlinks.json','android/app/src/main/AndroidManifest.xml','lib/push/client.ts','lib/push/server.ts','public/sw.js','app/manifest.ts','lib/reminders/policy.ts','lib/reminders/scheduler.ts']) {
    assert.equal(await readFile(`../../${path}`,'utf8'),execFileSync('git',['show',`${base}:${path}`],{encoding:'utf8'}),path);
  }

});
test('shared CSS outside the Figma Toast component stays byte-preserved', async () => {
  const before=execFileSync('git',['show',`${base}:app/globals.css`],{encoding:'utf8'});
  const after=await readFile('../../app/globals.css','utf8');
  const strip=css=>css.replace(/(?:\/\* Figma Alert\/Toast:[^*]*\*\/\n)?\.app-toast \{[\s\S]*?(?=\n\.home-content \{)/,'');
  assert.equal(strip(after),strip(before));
});
test('release requires Production config and Play upload certificate, backup excluded', async () => {
  const gradle=await readFile('android/app/build.gradle','utf8');
  if (gradle.includes('variant.enable = releaseReady')) {
    assert.match(gradle,/withBuildType\("release"\)[\s\S]*variant.enable = releaseReady/);
    assert.match(gradle,/Upload certificate does not match Play Console/);
    assert.match(gradle,/src\/release\/google-services.json/);
  } else {
    // PR #95 owns the release variant; this reconciliation branch keeps main's disabled gate.
    assert.match(gradle,/withBuildType\("release"\)[\s\S]*variant.enable = false/);
  }
  const manifest=await readFile('android/app/src/main/AndroidManifest.xml','utf8');
  assert.match(manifest,/POST_NOTIFICATIONS/);
  assert.doesNotMatch(manifest,/DelegationService/);
  assert.match(gradle,/addi-503b5/);
  assert.match(manifest,/allowBackup="false"/); assert.match(manifest,/android:path="\/auth\/native\/callback"/);
  const activity=await readFile('android/app/src/main/java/com/addi/app/MainActivity.java','utf8');
  assert.match(activity,/return !isLocal\(request.getUrl\(\)\)/);
  assert.doesNotMatch(activity,/TrustedWebActivity/);
});
test('OCR permits only bundled workers and WebAssembly, never remote code or JS eval',async()=>{
 const html=await readFile('index.html','utf8');assert.match(html,/worker-src 'self'/);assert.match(html,/script-src 'self' 'wasm-unsafe-eval'/);assert.doesNotMatch(html,/script-src[^;]*https:|'unsafe-eval'|worker-src[^;]*(?:blob:|https:)/);
});
