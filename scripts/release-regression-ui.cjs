const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs');
const assert = require('node:assert/strict');
const path = process.env.QA_OUTPUT_DIR || '/tmp/addi-release-regression-qa';
const baseUrl = process.env.QA_BASE_URL || 'http://localhost:3215';
assert.notEqual(new URL(baseUrl).hostname, 'addi-gamma.vercel.app', 'Production UI runs are forbidden');
fs.mkdirSync(path, { recursive: true });
(async () => {
 const browser = await chromium.launch({ channel: 'chrome', headless: true });
 const context = await browser.newContext();
 const page = await context.newPage();
 // Layout fixtures must not mutate data, activate Push or send analytics.
 await context.route('**/*', route => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.hostname.endsWith('.supabase.co') || url.hostname === 'addi-gamma.vercel.app'
    || url.hostname.endsWith('mixpanel.com') || !['GET', 'HEAD'].includes(request.method())) {
   return route.abort();
  }
  return route.continue();
 });
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const results=[];
 for(const width of [320,360,390,430]) {
  for(const scale of [1,2]) {
   await page.setViewportSize({width,height:width===390?844:800});
   await page.goto(`${baseUrl}/preview/notifications/regression`);
   await page.locator('.notification-row').first().waitFor();
   await page.evaluate(async()=>document.fonts.ready);
   if(scale===2) await page.evaluate(()=>{for(const el of document.querySelectorAll('.notification-title-row strong,.notification-title-row time,.notification-body,.notifications-retention-note')){const s=getComputedStyle(el);el.style.fontSize=`${parseFloat(s.fontSize)*2}px`;el.style.lineHeight=`${parseFloat(s.lineHeight)*2}px`;}});
   const metrics=await page.evaluate(()=>{
    const rows=[...document.querySelectorAll('.notification-row')]; const f=document.querySelector('footer'); const fr=f.getBoundingClientRect();
    const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>0.5 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>0.5;
    return {rows:rows.length,footerPosition:getComputedStyle(f).position,gap:fr.top-rows.at(-1).getBoundingClientRect().bottom,footerOverlap:rows.some(r=>overlap(fr,r.getBoundingClientRect())),rowOverlap:rows.some((r,i)=>i>0&&overlap(r.getBoundingClientRect(),rows[i-1].getBoundingClientRect())),dateOverlap:rows.some(r=>overlap(r.querySelector('strong').getBoundingClientRect(),r.querySelector('time').getBoundingClientRect())||overlap(r.querySelector('.notification-body').getBoundingClientRect(),r.querySelector('time').getBoundingClientRect())),horizontalOverflow:document.documentElement.scrollWidth>innerWidth,descending:rows.every((r,i)=>i===0||Date.parse(rows[i-1].querySelector('time').dateTime)>=Date.parse(r.querySelector('time').dateTime))};
   });
   assert.equal(metrics.rows, 24);
   assert.equal(metrics.footerPosition, 'static');
   assert.ok(metrics.gap >= 32);
   assert.equal(metrics.footerOverlap || metrics.rowOverlap || metrics.dateOverlap || metrics.horizontalOverflow, false);
   assert.equal(metrics.descending, true);
   await page.locator('footer').scrollIntoViewIfNeeded();
   await page.screenshot({path:`${path}/footer-${width}-${scale}x.png`});
   results.push({width,scale,...metrics});
  }
  await page.goto(`${baseUrl}/preview/notifications/empty`);
  await page.locator('.notifications-empty-state').waitFor();
  results.push({width,emptyFooterCount:await page.locator('.notifications-retention-note').count()});
  await page.goto(`${baseUrl}/preview/notifications/home`);
  await page.locator('.bottom-navigation').waitFor();
  results.push({width,nav:await page.locator('.bottom-navigation').evaluate(el=>{const s=getComputedStyle(el);return {border:s.borderTopWidth,shadow:s.boxShadow,height:el.getBoundingClientRect().height,padding:s.paddingBottom,bg:s.backgroundColor,pseudoBefore:getComputedStyle(el,'::before').content,pseudoAfter:getComputedStyle(el,'::after').content};})});
  await page.screenshot({path:`${path}/home-${width}.png`});
 }
 await page.goto(`${baseUrl}/preview/notifications/settings`);
 await page.locator('.notification-settings-screen').waitFor();
 results.push({settings:await page.locator('h1').innerText(),toggles:await page.locator('.notification-settings-toggle').count(),errors});
 assert.equal(errors.length, 0, errors.join('\n'));
 for (const result of results) {
  if ('emptyFooterCount' in result) assert.equal(result.emptyFooterCount, 0);
  if (result.nav) { assert.equal(result.nav.border, '0px'); assert.equal(result.nav.shadow, 'none'); }
 }
 fs.writeFileSync(`${path}/ui-qa.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
