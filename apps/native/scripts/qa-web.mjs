import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const output = 'qa-artifacts/web';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const results = [];
const errors = [];
const remoteRequests = [];
const screens = [ ['home', '/', '.home-screen'], ['medications', '/medications', '.medication-list-item'], ['moods', '/moods', '.mood-record-list'], ['visits', '/visits', '.visit-card'], ['notifications', '/notifications', '.notifications-screen'], ['my', '/my', '.my-home-screen'] ];
try {
  for (const width of [360, 390, 430]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173') && !request.url().startsWith('data:')) remoteRequests.push(request.url()); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    for (const [name, path, selector] of screens) {
      await page.goto(`http://127.0.0.1:4173${path}`);
      await page.locator(selector).first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(150);
      const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, brokenImages: [...document.images].filter(image => !image.complete || image.naturalWidth === 0).map(image => image.getAttribute('src')), font: getComputedStyle(document.body).fontFamily }));
      assert.ok(layout.scroll <= width, `${width} ${name} overflow`);
      assert.deepEqual(layout.brokenImages, [], `${name} images`);
      await page.screenshot({ path: `${output}/${width}-${name}.png`, fullPage: true });
      results.push({ width, name, ...layout });
    }
    await page.goto('http://127.0.0.1:4173/');
    await page.getByRole('button', { name: /^\d+월$/ }).click();
    await page.getByRole('dialog').waitFor();
    await page.evaluate(() => window.__ADDI_SHELL_QA__.back());
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.equal(new URL(page.url()).pathname, '/');
    await page.getByRole('link', { name: '복용약 목록 열기' }).click();
    await page.locator('.medication-list-delete').first().click();
    await page.evaluate(() => window.__ADDI_SHELL_QA__.back());
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.equal(new URL(page.url()).pathname, '/medications');
    await page.evaluate(() => window.__ADDI_SHELL_QA__.back());
    await page.waitForURL('http://127.0.0.1:4173/');
    await page.goto('http://127.0.0.1:4173/my');
    await page.getByRole('button', { name: '프로필 이미지 변경' }).click();
    await page.evaluate(() => window.__ADDI_SHELL_QA__.back());
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await page.goto('http://127.0.0.1:4173/moods');
    await page.getByRole('button', { name: /조회 기간/ }).click();
    await page.evaluate(() => window.__ADDI_SHELL_QA__.back());
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await page.goto('http://127.0.0.1:4173/moods/new');
    await page.locator('.mood-question-screen').waitFor();
    const inputOption = page.locator('label').filter({ hasText: '직접 입력할게요' });
    await inputOption.click();
    await page.getByRole('textbox').fill('키보드 테스트');
    await page.reload();
    await page.getByRole('textbox').waitFor();
    assert.equal(await page.getByRole('textbox').inputValue(), '키보드 테스트');
    await page.screenshot({ path: `${output}/${width}-mood-input.png`, fullPage: true });
    // Inject known OS insets to verify the transformed shared CSS at each width.
    await page.goto('http://127.0.0.1:4173/');
    await page.evaluate(() => { document.documentElement.style.setProperty('--safe-area-inset-top', '24px'); document.documentElement.style.setProperty('--safe-area-inset-bottom', '24px'); });
    const safeArea = await page.evaluate(() => ({ header: document.querySelector('.home-header')?.getBoundingClientRect().top, navPadding: getComputedStyle(document.querySelector('.bottom-navigation')).paddingBottom }));
    assert.equal(safeArea.navPadding, '24px');
    results.push({ width, interactions: 'sheet/modal/back/draft restart', safeArea });
    await context.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(remoteRequests, []);
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ results, errors, remoteRequests }, null, 2));
  await browser.close();
}
console.log(`PASS ${results.length} screen/interaction groups; zero remote requests and page errors`);
