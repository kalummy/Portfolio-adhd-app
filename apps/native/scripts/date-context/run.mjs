import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..');
const out=resolve(root,'apps/native/qa-artifacts/date-context');
const mode=process.argv[2]??'web';
const results=[],errors=[];
let browser,context,page;
const adb=(...args)=>execFileSync(process.env.ADB||'/Users/kalummy/Library/Android/sdk/platform-tools/adb',['-s','emulator-5554',...args],{encoding:'utf8'}).trim();
if(mode==='android'){
 assert.ok(adb('emu','avd','name').startsWith('addi_phase2_'));
 adb('shell','am','start','-n','com.addi.app.dev/com.addi.app.MainActivity');
 const pid=adb('shell','pidof','com.addi.app.dev');assert.ok(pid);
 adb('forward','tcp:9227',`localabstract:webview_devtools_remote_${pid}`);
 browser=await chromium.connectOverCDP('http://127.0.0.1:9227',{noDefaults:true});
 context=browser.contexts()[0];page=context.pages()[0];
}else{
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 context=await browser.newContext({viewport:{width:390,height:844},timezoneId:process.env.QA_TZ||'Asia/Seoul'});page=await context.newPage();
}
page.setDefaultTimeout(15000);
page.on('pageerror',e=>errors.push(e.message));
const origin=mode==='web'?'http://localhost:4196':mode==='android'?'https://localhost':'http://date-qa.test';
if(mode!=='web')await page.route(`${origin}/**`,async route=>{
 const path=new URL(route.request().url()).pathname;
 if(path.includes('capacitor')||path.includes('native-bridge'))return route.continue();
 const file=path==='/native.js'||path==='/native.css'?resolve(out,path.slice(1)):path.startsWith('/icons/')||path.startsWith('/cats/')||path.startsWith('/moods/')&&path.includes('.')?resolve(root,'public',path.slice(1)):resolve(out,'index.html');
 const ext=file.split('.').pop();await route.fulfill({body:await readFile(file),contentType:({js:'application/javascript',css:'text/css',svg:'image/svg+xml',png:'image/png',html:'text/html'})[ext]??'application/octet-stream'});
});
await context.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost','date-qa.test'].includes(u.hostname)?route.continue():route.abort();});
await page.addInitScript(()=>{sessionStorage.setItem('addi:splash:shown:v1','1');});
async function home(date){
 await page.locator('.home-screen').waitFor();
 await page.waitForFunction(date=>document.querySelector('.week-calendar [aria-pressed="true"], .week-strip [aria-pressed="true"], .week [aria-pressed="true"]')?.getAttribute('aria-label')===date+' 선택',date,{timeout:12000}).catch(async()=>{
   assert.equal(await page.locator('button[aria-pressed="true"][aria-label$=" 선택"]').getAttribute('aria-label'),date+' 선택');
 });
 assert.equal(new URL(page.url()).searchParams.get('date'),date);
}
async function reset(date){
 await page.evaluate(date=>{window.__DATE_QA__.reset(date);window.__DATE_QA_ROUTER__.replace('/medications?date='+date);},date);
 await page.locator('.medication-list-screen').waitFor();
 await page.evaluate(date=>window.__DATE_QA_ROUTER__.replace('/?date='+date),date);
 await home(date);
}
async function back(kind='header'){
 if(kind==='browser')await page.goBack();
 else if(kind==='router')await page.evaluate(()=>window.__DATE_QA_ROUTER__.back());
 else if(kind==='android'){adb('shell','input','keyevent','4');}
 else if(kind==='native')await page.evaluate(()=>window.__DATE_QA_BACK__());
 else await page.getByRole('button',{name:'이전 화면',exact:true}).click();
}
async function medDelete(date,kind,fail=false){
 await reset(date);await page.getByRole('link',{name:'복용약 목록 열기'}).click();
 if(fail)await page.evaluate(()=>window.__DATE_QA__.fail='medication-delete');
 await page.locator('.medication-list-delete').click();await page.getByRole('button',{name:'삭제',exact:true}).click();
 await page.waitForFunction(()=>window.__DATE_QA__.calls.includes('medication-delete'));
 if(fail){await page.getByRole('button',{name:'취소',exact:true}).click();await back(kind);}
 await home(date);
 if(!fail){assert.equal(await page.locator('.app-toast').innerText(),'복용중인 약을 삭제했어요.');await page.evaluate(date=>window.__DATE_QA_ROUTER__.push('/medications?date='+date),date);await page.locator('.medication-list-screen').waitFor();await back(kind);await home(date);}
}
async function visitEdit(date,kind,fail=false,discard=false){
 await reset(date);await page.getByRole('link',{name:'내원일정 확인하기'}).click();await page.getByRole('button',{name:'수정',exact:true}).click();
 await page.getByRole('button',{name:'2026년 9월 26일',exact:true}).click();
 if(discard){await back(kind);await page.getByRole('button',{name:'취소하기',exact:true}).click();}
 else{
 if(fail)await page.evaluate(()=>window.__DATE_QA__.fail='visit-edit');
 await page.getByRole('button',{name:'수정하기',exact:true}).click();await page.getByRole('button',{name:'확인',exact:true}).click();
 if(fail){await page.locator('.visit-error[role=alert]').waitFor();await back(kind);await page.getByRole('button',{name:'취소하기',exact:true}).click();}
 }
 await page.locator('.visit-list-screen').waitFor();
 assert.equal(new URL(page.url()).searchParams.get('date'),date);
 await back(kind);await home(date);
}
async function visitDelete(date,kind,fail=false){
 await reset(date);await page.getByRole('link',{name:'내원일정 확인하기'}).click();
 if(fail)await page.evaluate(()=>window.__DATE_QA__.fail='visit-delete');
 await page.getByRole('button',{name:'삭제',exact:true}).click();await page.getByRole('button',{name:'삭제하기',exact:true}).click();
 if(fail){await page.locator('.visit-error[role=alert]').waitFor();await back(kind);}
 await home(date);
}
async function record(name,fn){await fn();results.push(name);console.log('PASS',mode,name);}
try{
 if(mode==='android'){const cdp=await context.newCDPSession(page);await cdp.send('Page.setBypassCSP',{enabled:true});await page.evaluate(async()=>{await window.Capacitor.Plugins.App.removeAllListeners();history.replaceState({},'', '/');document.body.innerHTML='<div id="root"></div>';});await page.addStyleTag({content:await readFile(resolve(out,'native.css'),'utf8')});const injection=await cdp.send('Runtime.evaluate',{expression:await readFile(resolve(out,'native.js'),'utf8'),awaitPromise:true});if(injection.exceptionDetails)throw Error(injection.exceptionDetails.text);}
 const response=mode==='android'?null:await page.goto(origin+'/');console.log('HTTP',response?.status(),page.url());await page.locator('.home-screen').waitFor();
 await page.screenshot({path:resolve(out,`${mode}-initial.png`)});
 console.log('PAGE',await page.locator('body').innerText().then(t=>t.slice(0,180)));
 if(process.env.QA_SMOKE){console.log('SMOKE errors',errors);}
 else{
 const kind=mode==='android'?'android':mode==='native'?'native':'header';
 for(const date of ['2026-09-15','2026-09-16','2026-09-20']){
 await record(date+' medication delete '+kind,()=>medDelete(date,kind));
 await record(date+' visit edit '+kind,()=>visitEdit(date,kind));
 await record(date+' visit delete',()=>visitDelete(date,kind));
 }
 await record('medication failure preserves today',()=>medDelete('2026-09-16',kind,true));
 await record('visit edit failure preserves today',()=>visitEdit('2026-09-16',kind,true));
 await record('visit delete failure preserves today',()=>visitDelete('2026-09-16',kind,true));
 await record('visit discard preserves future',()=>visitEdit('2026-09-20',kind,false,true));
 for(const backKind of ['browser','router'])await record('medication delete '+backKind,()=>medDelete('2026-09-16',backKind));
 await record('intake time edit preserves past',async()=>{
 await reset('2026-09-15');await page.getByRole('link',{name:'복용약 목록 열기'}).click();await page.getByRole('link',{name:'복용 시간 수정',exact:true}).click();
 await page.getByRole('textbox',{name:'분',exact:true}).fill('17');await page.getByRole('button',{name:'완료',exact:true}).click();await home('2026-09-15');
 assert.ok(await page.evaluate(()=>window.__DATE_QA__.calls.includes('intake-edit')));
 });
 await record('intake cancel preserves today',async()=>{
 await reset('2026-09-16');await page.getByRole('button',{name:/복용 완료 취소/}).click();await home('2026-09-16');
 });
 await record('calendar selection then mutation',async()=>{
 await reset('2026-09-16');await page.getByRole('button',{name:'2026-09-15 선택',exact:true}).click();await home('2026-09-15');
 await page.getByRole('link',{name:'내원일정 확인하기'}).click();await back(kind);await home('2026-09-15');
 });
 await record('23:59 -> 00:01 KST preserves selected calendar key',async()=>{
 await page.clock.setFixedTime(new Date('2026-09-16T14:59:00Z'));await reset('2026-09-16');
 await page.getByRole('link',{name:'복용약 목록 열기'}).click();await page.clock.setFixedTime(new Date('2026-09-16T15:01:00Z'));
 await page.locator('.medication-list-delete').click();await page.getByRole('button',{name:'삭제',exact:true}).click();await home('2026-09-16');
 });
 assert.deepEqual(errors,[]);
 }
}catch(e){console.error('UI',await page.locator('body').innerText().catch(()=>''));console.error('DOM',await page.content().then(s=>s.slice(0,2500)));await page.screenshot({path:resolve(out,mode+'-failure.png')});console.error('ERRORS',errors);throw e;}
finally{await writeFile(resolve(out,`${mode}-results.json`),JSON.stringify({mode,syntheticRepositories:true,results,errors},null,2));if(mode==='android'){await page.unrouteAll();await page.reload();}await browser.close();}
