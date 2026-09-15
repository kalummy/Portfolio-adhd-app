/** UI wiring fixture. OAuth, AI and DB evidence are explicitly NOT claimed by this test. */
import {chromium} from 'playwright';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const output='qa-artifacts/parity-ui';await mkdir(output,{recursive:true});
await build({stdin:{contents:"export {validateRepositoryRequest} from './lib/native-api/contracts';export {createLocalPreviewMoodAnalysis} from './lib/mood-analysis';",resolveDir:resolve('../..'),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:output+'/helpers.mjs'});
const {validateRepositoryRequest,createLocalPreviewMoodAnalysis}=await import(pathToFileURL(resolve(output,'helpers.mjs')).href);
const adb=(...a)=>execFileSync(process.env.ADB || 'adb',['-s','emulator-5554',...a],{encoding:'utf8'}).trim();
assert.ok(adb('emu','avd','name').startsWith('addi_phase2_'));
adb('shell','am','start','-n','com.addi.app.dev/com.addi.app.MainActivity');
let pid;for(let n=0;n<50;n++){try{pid=adb('shell','pidof','com.addi.app.dev');if(pid)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(pid);adb('forward','tcp:9225',`localabstract:webview_devtools_remote_${pid}`);
let browser;for(let n=0;n<50;n++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9225',{noDefaults:true,timeout:1000});break;}catch{await new Promise(r=>setTimeout(r,100));}}assert.ok(browser);
const page=browser.contexts()[0].pages()[0];page.setDefaultTimeout(12000);
const uid='11111111-1111-4111-8111-111111111111';const user={id:uid,aud:'authenticated',role:'authenticated',email:'native-parity-ui@example.invalid',app_metadata:{provider:'google'},user_metadata:{name:'Dev QA'},created_at:'2026-01-01T00:00:00Z'};
const session={access_token:'SYNTHETIC_ACCESS_NATIVE_UI',refresh_token:'SYNTHETIC_REFRESH_NATIVE_UI',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};
let medications=[],intakes=[],moods=[],visit=null;let failAnalysis=true;let analysisCalls=0;const calls=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('https://ohobxicxchkaisxxswkk.supabase.co/**',async route=>{
 const req=route.request(),url=new URL(req.url());let result={},status=200;
 if(url.pathname==='/auth/v1/user'){if(req.method()==='PUT')Object.assign(user.user_metadata,req.postDataJSON().data);result=user;}
 else if(url.pathname==='/auth/v1/token')result=session;
 else if(url.pathname==='/auth/v1/logout')result={};
 else if(url.pathname==='/rest/v1/profiles')result={id:uid};
 else if(url.pathname==='/rest/v1/app_notifications')result=[];
 else if(url.pathname.startsWith('/functions/v1/native-push/')){status=409;result={code:'QA_FIXTURE_NO_REGISTRATION'};}
 else if(url.pathname.endsWith('/native-api/repository')){
   const {repository:r,method:m,args:a}=validateRepositoryRequest(req.postDataJSON());calls.push(`${r}.${m}`);
   if(r==='medications'){
    if(m==='createMany'){medications.push(...a[0]);result=a[0];}
    else if(m==='listAll')result=medications;
    else if(m==='listActive')result=medications.filter(x=>x.active!==false);
    else if(m==='getByIds')result=medications.filter(x=>a[0].includes(x.id));
    else if(m==='updateSchedule'){result=medications.find(x=>x.id===a[0]);Object.assign(result,a[1]);}
    else if(m==='deactivate'){result=medications.find(x=>x.id===a[0]);result.active=false;}
   }else if(r==='medicationIntakes'){
    if(m==='listAll')result=intakes;
    else if(m==='listByDate')result=intakes.filter(x=>x.date===a[0]);
    else if(m==='hasHistory')result=intakes.some(x=>x.medicationId===a[0]);
    else if(m==='setTaken'){intakes=intakes.filter(x=>!(x.medicationId===a[0]&&x.date===a[1]));result=a[2]?{id:a[0]+'-'+a[1],medicationId:a[0],date:a[1],taken:true,recordedAt:new Date().toISOString()}:null;if(result)intakes.push(result);}
    else if(m==='updateRecordedAt'){result=intakes.find(x=>x.medicationId===a[0]&&x.date===a[1]);result.recordedAt=a[2];}
   }else if(r==='moods'){
    if(m==='listAll'||m==='listRecent')result=moods;
    else if(m==='findByDate')result=moods.find(x=>x.date===a[0])??null;
    else if(m==='save'){result={...a[0],id:a[0].date};moods.push(result);}
    else if(m==='deleteByDate'){moods=moods.filter(x=>x.date!==a[0]);result=null;}
   }else if(r==='visitSchedules'){
    if(m==='getUpcoming')result=visit;
    else if(m==='saveUpcoming'){visit={id:'upcoming',visitDate:a[0],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};result=visit;}
    else if(m==='deleteUpcoming'){visit=null;result=null;}
   }else throw Error('unexpected_repository');
   result={data:result};
 }else if(url.pathname.endsWith('/native-api/medications/manual-match'))result={status:'not-found',medication:null};
 else if(url.pathname.endsWith('/native-api/medications/search'))result={medications:[]};
 else if(url.pathname.endsWith('/native-api/moods/analyze')){analysisCalls++;if(failAnalysis){status=503;result={code:'AI_NOT_CONFIGURED',failure_type:'configuration_error'};}else result=createLocalPreviewMoodAnalysis(req.postDataJSON().input);}
 else if(url.pathname.endsWith('/native-api/account'))result={ok:true};
 else{status=404;result={code:'UNEXPECTED_FIXTURE_PATH'};errors.push(url.pathname);}
 await route.fulfill({status,contentType:'application/json',body:JSON.stringify(result)});
});
const nav=async path=>{await page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},path);};
try{
 await page.evaluate(async value=>window.Capacitor.Plugins.AddiSecureStorage.set({key:'addi-native-dev-auth',value}),JSON.stringify(session));
 await page.reload();await nav('/');await page.locator('.home-screen').waitFor();
 await nav('/medications/new/manual/name');await page.locator('input').fill('Dev QA');

 await page.getByRole('button',{name:'다음',exact:true}).click();
 await page.locator('input').fill('10');

 await page.getByRole('button',{name:'다음',exact:true}).click();
 await page.waitForTimeout(500);
 await page.getByRole('button',{name:'다음으로',exact:true}).click();
 await page.getByRole('radio').first().click();await page.getByRole('button',{name:'다음',exact:true}).click();
 await page.locator('.home-screen').waitFor();assert.equal(medications.length,1);
 await page.getByRole('button',{name:/Dev QA.*복용 완료 기록/}).click();
 await page.waitForTimeout(600);assert.equal(intakes.length,1);console.log('PASS manual registration -> schedule -> save -> Home intake (UI fixture)');
 await nav('/medications');await page.locator('.medication-list-item').waitFor();
 await nav('/visits/new');
 const visitDates=await page.evaluate(()=>[5,6].map(day=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+1);d.setDate(day);return {key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`,label:`${d.getFullYear()}년 ${d.getMonth()+1}월 ${day}일`};}));
 await page.getByRole('button',{name:'다음 달',exact:true}).click();
 await page.getByRole('button',{name:visitDates[0].label,exact:true}).click();
 await page.getByRole('button',{name:'추가하기',exact:true}).click();await page.getByRole('button',{name:'확인',exact:true}).click();
 await page.waitForTimeout(500);assert.equal(visit.visitDate,visitDates[0].key);
 await nav('/visits/edit');await page.getByRole('button',{name:visitDates[1].label,exact:true}).click();await page.getByRole('button',{name:'수정하기',exact:true}).click();await page.getByRole('button',{name:'확인',exact:true}).click();await page.waitForTimeout(500);assert.equal(visit.visitDate,visitDates[1].key);console.log('PASS visit create/edit (UI fixture)');
 await nav('/moods/new');
 for(let step=0;step<3;step++){await page.locator('.mood-question-option-toggle').first().click();await page.getByRole('button',{name:step===2?'완료':`다음 (${step+1}/3)`,exact:true}).click();}
 await page.waitForTimeout(600);
 failAnalysis=false;
 const retry=page.getByRole('button',{name:/다시 시도|분석 다시/});await retry.click();
 await page.locator('.mood-result-screen').waitFor({timeout:15000});await page.getByRole('button',{name:'저장',exact:true}).click();await page.locator('.home-screen').waitFor();assert.equal(moods.length,1);console.log('PASS mood questions -> analysis failure/retry -> result/save (mock analysis only)');
 await nav('/moods/'+moods[0].date);await page.waitForTimeout(400);
 await nav('/my');await page.getByRole('button',{name:'프로필 이미지 변경'}).click();await page.getByRole('radio',{name:'오리',exact:true}).click();await page.getByRole('button',{name:'선택',exact:true}).click();await page.waitForTimeout(400);assert.equal(user.user_metadata.addi_profile,'duck');console.log('PASS profile selection (UI fixture)');
 assert.equal(analysisCalls,2,'One initial analysis and one explicit retry');
 await nav('/my');await page.getByRole('button',{name:'로그아웃',exact:true}).click();await page.locator('.member-login-button.google').waitFor();
 assert.equal(await page.evaluate(async()=>(await window.Capacitor.Plugins.AddiSecureStorage.get({key:'addi-native-dev-auth'})).value),null);console.log('PASS real Keystore cleared through logout (synthetic Auth fixture)');
 assert.deepEqual(errors,[]);
 await writeFile(output+'/result.json',JSON.stringify({fixture:true,liveOAuth:false,liveAI:false,liveDatabase:false,calls:[...new Set(calls)],analysisCalls,errors,logoutCleared:true},null,2));
}catch(error){console.log('UI errors',errors);throw error;}finally{await browser.close();}
