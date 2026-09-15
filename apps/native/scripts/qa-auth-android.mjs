/** Disposable emulator + synthetic transport only. Never use a real token/account here. */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const serial=process.env.ANDROID_SERIAL||'emulator-5554';
const adbPath=process.env.ADB||'adb';
assert.ok(serial.startsWith('emulator-'));
const adb=(...args)=>execFileSync(adbPath,['-s',serial,...args],{encoding:'utf8',maxBuffer:16*1024*1024}).trim();
assert.ok(adb('emu','avd','name').startsWith('addi_phase2_'));
const out='qa-artifacts/auth-android'; await mkdir(out,{recursive:true});
let browser,page;const results=[],errors=[];
const endpoint='https://ohobxicxchkaisxxswkk.supabase.co';
const callback='https://addi-auth-qa.example.com/auth/native/callback';
let currentId='11111111-1111-4111-8111-111111111111', provider='google', profiles=new Set(), tokenCounter=0, exchanges=0, refreshes=0;
function user() { return { id:currentId,aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid',app_metadata:{provider},user_metadata:{name:'Auth QA'},created_at:'2026-01-01T00:00:00Z',identities:[{provider,id:'synthetic-provider-identity',identity_id:'synthetic-provider-identity',user_id:currentId}] }; }
function session() {return {access_token:`SYNTHETIC_ACCESS_${++tokenCounter}`,refresh_token:`SYNTHETIC_REFRESH_${tokenCounter}`,expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:user()};}
async function connect() {
  const pid=adb('shell','pidof','com.addi.app');adb('forward','tcp:9223',`localabstract:webview_devtools_remote_${pid}`);
  for(let retry=0;retry<30;retry++) {try{browser=await chromium.connectOverCDP('http://127.0.0.1:9223',{noDefaults:true});break;}catch{await new Promise(r=>setTimeout(r,100));}}
  page=browser.contexts()[0].pages()[0];page.on('pageerror',e=>errors.push(e.message));
  await page.route(`${endpoint}/**`,async route=>{
    const req=route.request(),url=new URL(req.url());let data={};
    if(url.pathname==='/auth/v1/token') {
      const body=req.postDataJSON();if(url.searchParams.get('grant_type')==='pkce') {assert.ok(body.code_verifier.length>=43);exchanges++;}else{assert.ok(body.refresh_token.startsWith('SYNTHETIC_REFRESH_'));refreshes++;}
      data=session();
    } else if(url.pathname==='/auth/v1/user') data=user();
    else if(url.pathname==='/auth/v1/logout') data={};
    else if(url.pathname==='/rest/v1/profiles') {
      assert.ok(req.headers().authorization?.startsWith('Bearer SYNTHETIC_ACCESS_'));
      if(req.method()==='POST'){assert.equal(req.postDataJSON().id,currentId);profiles.add(currentId);data=null;}
      else data=profiles.has(currentId)?{id:currentId}:null;
    } else if(url.pathname.startsWith('/rest/v1/')) {
      assert.ok(req.headers().authorization?.startsWith('Bearer SYNTHETIC_ACCESS_'));assert.equal(req.method(),'GET');
      data=req.headers().accept?.includes('application/vnd.pgrst.object')?null:[];
    } else throw new Error('Unexpected fixture request path');
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
}
async function capture(name){await writeFile(`${out}/${name}.png`,execFileSync(adbPath,['-s',serial,'exec-out','screencap','-p'],{maxBuffer:16*1024*1024}));}
async function read(key){return page.evaluate(async key=>(await window.Capacitor.Plugins.AddiSecureStorage.get({key})).value,key);}
async function put(key,value){await page.evaluate(async({key,value})=>window.Capacitor.Plugins.AddiSecureStorage.set({key,value}),{key,value});}
async function mockBrowser(){await page.evaluate(()=>{window.Capacitor.Plugins.Browser.open=async()=>{};window.Capacitor.Plugins.Browser.close=async()=>{};});}
async function intent(url){adb('shell','am','start','-a','android.intent.action.VIEW','-c','android.intent.category.BROWSABLE','-d',url.replaceAll('&','\\&'),'-n','com.addi.app/.MainActivity');}
async function login(selected,{cold=false}={}) {
  provider=selected;await mockBrowser();await page.getByRole('button',{name:selected==='google'?'구글로 시작':'카카오로 시작'}).click();
  await page.getByRole('button',{name:'로그인 취소'}).waitFor();
  let attempt;for(let i=0;i<50;i++){const raw=await read('addi-native-attempt');if(raw){attempt=JSON.parse(raw);break;}await page.waitForTimeout(50);}
  assert.equal(attempt.provider,selected);
  const url=`${callback}?attempt=${attempt.id}&code=synthetic-code`;
  if(cold){await browser.close();adb('shell','am','force-stop','com.addi.app');
    // Delay the bundled entry until CDP can install the mock transport on cold launch.
    // Android callback delivery itself is real; server responses remain fixtures.
    await intent(url);await connect();
    // The first network request may precede interception; restart the page while the
    // durable attempt is still present. Cold callback remains in getLaunchUrl().
    const stillPending=await read('addi-native-attempt');
    if(!stillPending) throw new Error('Cold exchange ran before transport interception; do not misreport');
    await page.reload();
  } else await intent(url);
  await page.locator('.home-screen').waitFor({timeout:20000});
  assert.equal(JSON.parse(await read('addi-native-dev-auth')).user.id,currentId);
  assert.equal(await read('addi-native-attempt'),null);
  return url;
}
async function logout(){await page.goto('https://localhost/my');await page.locator('.my-home-screen').waitFor();await page.getByRole('button',{name:'로그아웃',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.member-login-button.google')?.disabled===false);assert.equal(await read('addi-native-dev-auth'),null);}
try {
  await connect();
  await page.evaluate(()=>window.Capacitor.Plugins.AddiSecureStorage.clear());await page.reload();
  await page.getByRole('button',{name:'구글로 시작'}).waitFor();
  // Real AndroidKeyStore operation; ciphertext-at-rest canary and process restart.
  await put('addi-native-canary','SYNTHETIC_REFRESH_CANARY');assert.equal(await read('addi-native-canary'),'SYNTHETIC_REFRESH_CANARY');
  const disk=adb('shell','run-as','com.addi.app','cat','shared_prefs/addi_native_auth.xml');assert.ok(!disk.includes('SYNTHETIC_REFRESH_CANARY'));assert.ok(disk.includes('v1:'));
  await browser.close();adb('shell','am','force-stop','com.addi.app');adb('shell','am','start','-W','-n','com.addi.app/.MainActivity');await connect();assert.equal(await read('addi-native-canary'),'SYNTHETIC_REFRESH_CANARY');results.push({test:'Keystore ciphertext + process restart',pass:true});
  for(const width of [360,390,430]) {adb('shell','wm','size',`${width*3}x1920`);adb('shell','wm','density','480');await page.waitForFunction(expected=>innerWidth===expected,width,{timeout:5000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);await capture(`login-${width}`);}
  results.push({test:'login UI 360/390/430',pass:true});
  await mockBrowser();await page.getByRole('button',{name:'구글로 시작'}).click();await page.getByRole('button',{name:'로그인 취소'}).click();await page.getByRole('button',{name:'구글로 시작'}).waitFor({state:'visible'});assert.equal(await read('addi-native-attempt'),null);results.push({test:'cancel clears native pending attempt',pass:true});
  for(const selected of ['google','kakao']) {
    const before=exchanges;const url=await login(selected);assert.equal(exchanges,before+1);
    const disk=adb('shell','run-as','com.addi.app','cat','shared_prefs/addi_native_auth.xml');assert.ok(!disk.includes('SYNTHETIC_REFRESH_'));assert.ok(!disk.includes('synthetic-code'));
    await intent(url);await page.waitForTimeout(200);assert.equal(exchanges,before+1);
    await capture(`${selected}-fixture-authenticated`);
    results.push({test:`${selected} foreground callback, profile, same ID, duplicate`,pass:true,transport:'synthetic'});
    await logout();results.push({test:`${selected} logout secure session removal`,pass:true});
  }
  await login('google');await browser.close();adb('shell','am','force-stop','com.addi.app');adb('shell','am','start','-W','-n','com.addi.app/.MainActivity');await connect();await page.reload();await page.locator('.home-screen').waitFor({timeout:20000});results.push({test:'encrypted session restore after process death',pass:true,transport:'synthetic'});
  await logout();currentId='22222222-2222-4222-8222-222222222222';await login('kakao');results.push({test:'switch account replaces previous ID',pass:true,transport:'synthetic'});
  await logout();
  // Feed a durable valid pending attempt before a real cold App Link intent.
  const id='c'.repeat(64),flowId='d'.repeat(32);
  await put('addi-native-attempt',JSON.stringify({id,flowId,provider:'google',createdAt:Date.now()}));
  await put(`addi-native-dev-auth-flow-${flowId}-code-verifier`,JSON.stringify('e'.repeat(64)));
  await browser.close();adb('shell','am','force-stop','com.addi.app');await intent(`${callback}?attempt=${id}&code=synthetic-cold-code`);await connect();
  await page.locator('.home-screen').waitFor({timeout:20000});results.push({test:'cold App Link intent -> SDK exchange -> profile',pass:true,transport:'synthetic',verifiedDomain:false});
  await logout();
  await intent('https://attacker.example.com/auth/native/callback?code=synthetic-invalid');await page.waitForTimeout(200);assert.equal(await read('addi-native-dev-auth'),null);results.push({test:'wrong callback URL stays signed out',pass:true});
  assert.deepEqual(errors,[]);
} finally {await writeFile(`${out}/results.json`,JSON.stringify({results,errors,realOAuth:false,verifiedHttpsAppLink:false},null,2));await browser?.close();}
console.log(`PASS ${results.length} native Auth groups (synthetic transport; no live identity assertion)`);
