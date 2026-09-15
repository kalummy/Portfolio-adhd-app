import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const serial = process.env.ANDROID_SERIAL || 'emulator-5554';
assert.ok(serial.startsWith('emulator-'), 'QA is restricted to a disposable emulator');
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
assert.ok(adb('emu', 'avd', 'name').startsWith('addi_phase1_'), 'Expected a Phase 1 disposable AVD');
const output = 'qa-artifacts/android';
await mkdir(output, { recursive: true });
const results = [], errors = [], remoteRequests = [];
let browser, page;
async function connect() {
  const pid = adb('shell', 'pidof', 'com.addi.app.dev');
  adb('forward', 'tcp:9223', `localabstract:webview_devtools_remote_${pid}`);
  browser = await chromium.connectOverCDP('http://127.0.0.1:9223', { noDefaults: true });
  page = browser.contexts()[0].pages()[0];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith('https://localhost/') && !request.url().startsWith('data:')) remoteRequests.push(request.url()); });
}
async function capture(name) {
  await writeFile(`${output}/${name}.png`, execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 16 * 1024 * 1024 }));
}
async function foreground() {
  const activities = adb('shell', 'dumpsys', 'activity', 'activities');
  assert.match(activities.split('\n').find(line => line.includes('topResumedActivity')) || '', /com\.addi\.app\.dev\/com\.addi\.app\.MainActivity/);
}
async function back() { adb('shell', 'input', 'keyevent', '4'); await page.waitForTimeout(350); }
try {
  await connect();
  for (const width of [360, 390, 430]) {
    adb('shell', 'wm', 'size', `${width * 3}x1920`);
    await page.waitForTimeout(350);
    for (const [name, path, selector] of [ ['home','/','.home-screen'],['medications','/medications','.medication-list-item'],['moods','/moods','.mood-record-list'],['visits','/visits','.visit-card'],['notifications','/notifications','.notification-row'],['my','/my','.my-home-screen'] ]) {
      await page.goto(`https://localhost${path}`);
      await page.locator(selector).first().waitFor({ timeout: 10000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(150);
      const state = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scroll: document.documentElement.scrollWidth, top: getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top'), bottom: getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-bottom'), brokenImages: [...document.images].filter(image => !image.complete || image.naturalWidth === 0).map(image => image.src) }));
      assert.equal(state.width, width); assert.equal(state.scroll, width); assert.deepEqual(state.brokenImages, []);
      await foreground(); await capture(`${width}-${name}`);
      results.push({ name, ...state, foreground: 'com.addi.app.dev/com.addi.app.MainActivity', url: page.url() });
    }
  }
  adb('shell', 'wm', 'size', '1170x1920');
  await page.goto('https://localhost/');
  await page.getByRole('button', { name: /^\d+월$/ }).click();
  await page.getByRole('dialog').waitFor(); await capture('date-sheet');
  await back(); await page.getByRole('dialog').waitFor({ state: 'detached' }); assert.equal(new URL(page.url()).pathname, '/');
  await page.getByRole('link', { name: '복용약 목록 열기' }).click();
  await page.locator('.medication-list-delete').first().click(); await capture('delete-modal');
  await back(); await page.getByRole('dialog').waitFor({ state: 'detached' }); assert.equal(new URL(page.url()).pathname, '/medications');
  await back(); await page.waitForURL('https://localhost/');
  await page.goto('https://localhost/my'); await page.getByRole('button', { name: '프로필 이미지 변경' }).click();
  await back(); await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.goto('https://localhost/moods'); await page.getByRole('button', { name: /조회 기간/ }).click();
  await back(); await page.getByRole('dialog').waitFor({ state: 'detached' });
  results.push({ back: 'native keyevent: date sheet, delete modal, route, profile sheet, period sheet PASS' });
  await page.goto('https://localhost/moods/new');
  await page.locator('.mood-question-screen').waitFor();
  if (!await page.getByRole('textbox').count()) await page.locator('label').filter({ hasText: '직접 입력할게요' }).click();
  await page.getByRole('textbox').click(); await page.getByRole('textbox').fill('fixture keyboard test');
  await page.waitForFunction(() => window.__ADDI_SHELL_QA__.state.keyboardVisible);
  const keyboard = await page.evaluate(() => ({ state: window.__ADDI_SHELL_QA__.state, viewport: visualViewport.height, inputBottom: document.querySelector('input[type=text]').getBoundingClientRect().bottom }));
  assert.ok(keyboard.inputBottom <= keyboard.viewport, JSON.stringify(keyboard));
  await capture('keyboard-open');
  await back(); await page.waitForFunction(() => !window.__ADDI_SHELL_QA__.state.keyboardVisible); await capture('keyboard-closed');
  assert.equal(new URL(page.url()).pathname, '/moods/new');
  adb('shell', 'input', 'keyevent', '3');
  const warmStart = adb('shell','am','start','-W','-n','com.addi.app.dev/com.addi.app.MainActivity');
  await page.waitForFunction(() => window.__ADDI_SHELL_QA__.state.active && window.__ADDI_SHELL_QA__.state.resumes > 0);
  assert.equal(await page.getByRole('textbox').inputValue(), 'fixture keyboard test'); await foreground();
  results.push({ keyboard, warmStart, lifecycle: await page.evaluate(() => window.__ADDI_SHELL_QA__.state) });
  await browser.close();
  adb('shell', 'am', 'force-stop', 'com.addi.app.dev');
  const coldStart = adb('shell','am','start','-W','-n','com.addi.app.dev/com.addi.app.MainActivity');
  await new Promise(resolve => setTimeout(resolve, 1200));
  await connect(); await page.locator('.home-screen').waitFor(); await capture('cold-restart');
  await page.goto('https://localhost/moods/new'); await page.getByRole('textbox').waitFor();
  assert.equal(await page.getByRole('textbox').inputValue(), 'fixture keyboard test');
  results.push({ coldStart, restartDraft: 'PASS' });
  await page.goto('https://localhost/'); await page.locator('.home-screen').waitFor(); await back();
  const top = adb('shell','dumpsys','activity','activities').split('\n').find(line=>line.includes('topResumedActivity'));
  assert.ok(!top?.includes('com.addi.app.dev')); results.push({ rootBackExit: 'PASS' });
  const beforeWarmPid = adb('shell', 'pidof', 'com.addi.app.dev');
  await browser.close();
  const activityWarmStart = adb('shell','am','start','-W','-n','com.addi.app.dev/com.addi.app.MainActivity');
  assert.equal(adb('shell','pidof','com.addi.app.dev'), beforeWarmPid);
  await new Promise(resolve => setTimeout(resolve, 700));
  await connect(); await page.locator('.home-screen').waitFor(); await capture('warm-start');
  results.push({ activityWarmStart, sameProcess: true });
  await page.evaluate(() => { window.location.href = 'https://example.com/'; });
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(page.url(), 'https://localhost/'); await foreground();
  const apiBlocked = await page.evaluate(async () => { try { await fetch('/api/moods/analyze', { method: 'POST' }); return false; } catch { return true; } });
  assert.equal(apiBlocked, true);
  results.push({ externalNavigationBlocked: true, apiBlocked });
  assert.deepEqual(errors, []); assert.deepEqual(remoteRequests, []);
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ results, errors, remoteRequests }, null, 2));
  await browser?.close();
}
console.log(`PASS ${results.length} Android screen/lifecycle groups`);
