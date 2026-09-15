import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const base='77efdd9f8d3761ebc210238a09409dbefc618b7a';
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
test('web Google/Kakao, cookie callback, DAL, TWA, CSS, API and DB byte-preserved', async () => {
  for(const path of ['lib/auth/client.ts','app/auth/callback/route.ts','lib/supabase/client.ts','lib/supabase/server.ts','lib/supabase/proxy.ts','public/.well-known/assetlinks.json','android/app/src/main/AndroidManifest.xml','app/globals.css']) {
    assert.equal(await readFile(`../../${path}`,'utf8'),execFileSync('git',['show',`${base}:${path}`],{encoding:'utf8'}),path);
  }
  const paths=execFileSync('git',['diff','--name-only',base],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
  assert.ok(paths.every(p=>p.startsWith('apps/native/')||['lib/auth/server.ts','lib/auth/profile.ts'].includes(p)),paths.join('\n'));
  const previous=execFileSync('git',['show',`${base}:lib/auth/server.ts`],{encoding:'utf8'});
  assert.ok((await readFile('../../lib/auth/profile.ts','utf8')).endsWith(previous.slice(previous.indexOf('export async function ensureUserProfile'))));
});
test('release disabled, exact HTTPS callback, no push, backup excluded', async () => {
  assert.match(await readFile('android/app/build.gradle','utf8'),/withBuildType\("release"\)[\s\S]*variant.enable = false/);
  const manifest=await readFile('android/app/src/main/AndroidManifest.xml','utf8');
  assert.doesNotMatch(manifest,/POST_NOTIFICATIONS|Firebase|DelegationService/);
  assert.match(manifest,/allowBackup="false"/); assert.match(manifest,/android:path="\/auth\/native\/callback"/);
  const activity=await readFile('android/app/src/main/java/com/addi/app/MainActivity.java','utf8');
  assert.match(activity,/return !isLocal\(request.getUrl\(\)\)/);
  assert.doesNotMatch(activity,/TrustedWebActivity/);
});
