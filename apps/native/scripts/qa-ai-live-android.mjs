import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
const url='https://ohobxicxchkaisxxswkk.supabase.co';
assert.equal(process.env.ADDI_NATIVE_QA_URL,url);assert.ok(process.env.ADDI_NATIVE_QA_SERVICE_KEY);
const opts={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(url,process.env.ADDI_NATIVE_QA_SERVICE_KEY,opts);
const client=createClient(url,process.env.ADDI_NATIVE_QA_SERVICE_KEY,opts);
const adb=(...args)=>execFileSync(process.env.ADB_PATH || 'adb',['-s','emulator-5554',...args],{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
assert.ok(adb('emu','avd','name').startsWith('addi_phase2_'));
let owner,browser,page,stage='start';const checks=[];
const mark=value=>{checks.push(value);console.log('PASS',value);};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function connect(){
 adb('shell','am','start','-n','com.addi.app.dev/com.addi.app.MainActivity');
 let pid;for(let i=0;i<60;i++){try{pid=adb('shell','pidof','com.addi.app.dev');if(pid)break;}catch{}await pause(100);}assert.ok(pid);
 adb('forward','tcp:9225',`localabstract:webview_devtools_remote_${pid}`);
 for(let i=0;i<50;i++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9225',{noDefaults:true,timeout:1000});break;}catch{await pause(100);}}assert.ok(browser);
 page=browser.contexts()[0].pages()[0];page.setDefaultTimeout(30000);
}
const nav=async path=>page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},path);
async function seed(){const signed=await client.auth.signInWithPassword({email,password});assert.ifError(signed.error);await page.evaluate(async session=>window.Capacitor.Plugins.AddiSecureStorage.set({key:'addi-native-dev-auth',value:JSON.stringify(session)}),signed.data.session);await page.reload();await nav('/');await page.locator('.home-screen').waitFor();}
async function rows(table){const result=await admin.from(table).select('*').eq('user_id',owner);assert.ifError(result.error);return result.data;}
async function expectCount(table,count){for(let n=0;n<30;n++){if((await rows(table)).length===count)return;await pause(300);}assert.fail('count mismatch');}
const email=`native-parity-device-${randomUUID()}@example.invalid`,password=randomBytes(32).toString('base64url');
const evidence={apk:'0.3.1-prototype-dev',emulator:true,liveOAuth:false,mockApi:false,mockAi:false,productionChanges:0,fcmSends:0};
try {
 assert.match(adb('shell','dumpsys','package','com.addi.app.dev'),/versionName=0\.3\.1-prototype-dev/);
 stage='disposable Dev account';const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(created.error);owner=created.data.user.id;
 await connect();await seed();
 stage='offline failure and retry';await nav('/moods/new');
 for(let step=0;step<3;step++){await page.locator('.mood-question-option-toggle').first().click();if(step===2)await browser.contexts()[0].setOffline(true);await page.getByRole('button',{name:step===2?'완료':`다음 (${step+1}/3)`,exact:true}).click();}
 const retry=page.getByRole('button',{name:/다시 시도|분석 다시/});await retry.waitFor();evidence.offlineRetryVisible=true;
 await browser.contexts()[0].setOffline(false);
 const responsePromise=page.waitForResponse(r=>r.url().endsWith('/native-api/moods/analyze'),{timeout:120000});
 await retry.click();const response=await responsePromise;const req=response.request(),headers=await req.allHeaders(),body=req.postDataJSON();
 evidence.request={url:req.url(),method:req.method(),bearerPresent:/^Bearer /.test(headers.authorization??''),cookiePresent:!!headers.cookie,origin:headers.origin,requestBodyKeys:Object.keys(body.input),evidenceCount:body.input.evidence.length,status:response.status(),requestId:response.headers()['x-addi-ai-request-id']??null};
 assert.equal(response.status(),200);const analysis=await response.json();assert.match(analysis.model,/^gpt-/);assert.equal(analysis.version,'mood-daily-v1');
 await page.locator('.mood-result-screen').waitFor({timeout:120000});evidence.realAi=true;evidence.model=analysis.model;mark('Real Native AI response after offline failure and explicit retry');
 stage='save and DB comparison';await page.getByRole('button',{name:'저장',exact:true}).click();await page.locator('.home-screen').waitFor();await expectCount('mood_records',1);
 const [mood]=await rows('mood_records');assert.equal(mood.user_id,owner);assert.equal(mood.analysis_status,'completed');assert.equal(mood.analysis_model,analysis.model);assert.deepEqual(mood.analysis_result,analysis.result);
 evidence.savedAnalysisMatchesDevDb=true;mark('Native saved AI metadata/result match Dev DB and owner');
 stage='reopen saved result';await nav('/moods/'+mood.mood_date);await page.locator('.mood-record-detail-cards').waitFor();assert.ok((await page.locator('.mood-record-detail-cards').innerText()).includes(analysis.result.clinicPhrase.text));evidence.savedDetailMatches=true;mark('Date detail displays the persisted real AI result');
 stage='process restart';await browser.close();browser=null;adb('shell','am','force-stop','com.addi.app.dev');await connect();await nav('/moods/'+mood.mood_date);await page.locator('.mood-record-detail-cards').waitFor();assert.ok((await page.locator('.mood-record-detail-cards').innerText()).includes(analysis.result.clinicPhrase.text));evidence.coldRestoreMatches=true;mark('Native cold restore retains session and saved AI result');
 evidence.passed=true;
}catch(error){evidence.passed=false;evidence.failedStage=stage;evidence.errorClass=error.name;console.error('FAIL Native AI QA:',stage,error.name);process.exitCode=1;}
finally {
 if(browser){await browser.contexts()[0].setOffline(false).catch(()=>{});if(page)await page.evaluate(async()=>window.Capacitor.Plugins.AddiSecureStorage.remove({key:'addi-native-dev-auth'})).catch(()=>{});await browser.close().catch(()=>{});}
 if(owner){const removed=await admin.auth.admin.deleteUser(owner,false);assert.ifError(removed.error);await expectCount('mood_records',0);evidence.disposableAccountAndRowsRemoved=true;}
 await writeFile(process.env.ADDI_NATIVE_QA_REPORT || '/private/tmp/addi-native-ai-live-result.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
}
