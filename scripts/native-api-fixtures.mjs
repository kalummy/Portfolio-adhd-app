import assert from 'node:assert/strict';
import { createNativeApiHandler } from '../supabase/functions/native-api/bundle.js';
const origin='https://ohobxicxchkaisxxswkk.supabase.co';
let calls=0;
const deps={supabaseUrl:origin,authenticate:async()=>{calls++;return {user:{id:'synthetic-owner',is_anonymous:false},client:{}};},admin:()=>{throw Error('unexpected_admin');}};
const handler=createNativeApiHandler(deps);
const request=(path,body,headers={},method='POST')=>new Request(origin+'/functions/v1/native-api/'+path,{method,headers:{authorization:'Bearer synthetic',origin:'https://localhost','content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
for(const body of [null,{}, {repository:'__proto__',method:'toString',args:[]},{repository:'medications',method:'migrateInitial',args:[]},{repository:'medications',method:'getByIds',args:[],user_id:'spoof'},{repository:'visitSchedules',method:'saveUpcoming',args:['2026-02-30']},{repository:'medicationIntakes',method:'setTaken',args:['id','2026-09-15','true']},{repository:'medications',method:'updateSchedule',args:['id',{schedule:'daily',userId:'spoof'}]},{repository:'medications',method:'updateSchedule',args:['id',{scheduledTime:'25:00'}]}]) {
 assert.equal((await handler(request('repository',body))).status,400);
}
assert.equal((await handler(request('repository',{}, {origin:'https://evil.example'}))).status,403);
assert.equal((await handler(request('repository',{}, {authorization:''}))).status,401);
assert.equal((await handler(request('unknown',{}))).status,404);
assert.equal((await handler(request('repository',undefined,{},'GET'))).status,405);
assert.equal((await handler(request('repository','x'.repeat(100_000)))).status,400);
const before=calls;const options=await handler(request('repository',undefined,{},'OPTIONS'));
assert.equal(options.status,204);assert.equal(options.headers.get('access-control-allow-origin'),'https://localhost');assert.equal(calls,before);
// The hosted gateway forwards /native-api/*, without the external /functions/v1 prefix.
const hosted=path=>new Request(origin+path,{method:'OPTIONS',headers:{origin:'https://localhost'}});
assert.equal((await handler(hosted('/native-api/repository'))).status,204);
assert.equal((await handler(hosted('/native-api/moods/analyze'))).status,204);
for (const path of ['/repository','/other/native-api/repository','/native-api-evil/repository','/native-api/unknown']) {
 assert.equal((await handler(hosted(path))).status,404);
}
const disabled=createNativeApiHandler({...deps,supabaseUrl:'https://invalid.supabase.co'});
assert.equal((await disabled(request('repository',{}))).status,503);
let deleted=0;
const accountHandler=createNativeApiHandler({...deps,admin:()=>({
 from:table=>{assert.equal(table,'feedback');return {delete:()=>({eq:async(column,owner)=>{assert.equal(column,'user_id');assert.equal(owner,'synthetic-owner');return {error:null};}})};},
 auth:{admin:{deleteUser:async owner=>{assert.equal(owner,'synthetic-owner');deleted++;return {error:null};}}},
})});
for (const body of [undefined,new Uint8Array(0)]) {
 const req=new Request(origin+'/native-api/account',{method:'DELETE',headers:{authorization:'Bearer synthetic'},body});
 assert.equal((await accountHandler(req)).status,200);
}
assert.equal(deleted,2);
assert.equal((await accountHandler(request('account',{user_id:'spoof'},{},'DELETE'))).status,400);
assert.equal((await accountHandler(request('account?user_id=spoof',undefined,{},'DELETE'))).status,400);
assert.equal(deleted,2);
console.log('PASS Native API input, owner spoof, methods, origins, preflight, body limit, Dev-only guard');

const input={date:'2026-09-15',recordedAt:'2026-09-15T12:00:00Z',hasMedicationIntake:false,evidence:[{id:'focus:good',category:'concentration',label:'집중이 잘 되었어요'}]};
let relayCalls=0;
const relayHandler=createNativeApiHandler({...deps,analyzeMood:async(body,token)=>{relayCalls++;assert.equal(token,'synthetic');assert.equal(body.date,input.date);assert.equal(body.evidence[0].id,input.evidence[0].id);return Response.json({code:'UNAUTHORIZED'},{status:401});}});
assert.equal((await relayHandler(request('moods/analyze',{input},{authorization:''}))).status,401);
assert.equal((await relayHandler(request('moods/analyze',{input},{origin:'https://evil.example'}))).status,403);
assert.equal((await relayHandler(request('moods/analyze',{input:{}}))).status,400);
assert.equal(relayCalls,0);
assert.equal((await relayHandler(request('moods/analyze',{input}))).status,401);assert.equal(relayCalls,1);
const stages=[];
const missing=createNativeApiHandler({...deps,auditAnalysis:stage=>stages.push(stage)});
assert.equal((await missing(request('moods/analyze',{input}))).status,503);
assert.deepEqual(stages,['configuration_missing']);
const {requestPreviewMoodAnalysis}=await import('../supabase/functions/native-api/bundle.js');
const id='11111111-1111-4111-8111-111111111111';
let transportCalls=0;
const fetchResult=async(url,init)=>{
 transportCalls++;
 assert.equal(url,'https://addi-git-codex-capacitor-nati-5faccb-kalummy0427-2332s-projects.vercel.app/api/native/moods/analyze');
 assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.equal(init.headers.Authorization,'Bearer synthetic');assert.equal(init.headers['x-vercel-protection-bypass'],'synthetic-access');assert.equal(init.headers['x-addi-ai-request-id'],id);assert.equal(init.headers.Cookie,undefined);
 assert.deepEqual(JSON.parse(init.body),{input});
 return Response.json({model:'gpt-5-mini',version:'mood-daily-v1',createdAt:'2026-09-15T12:00:00Z',result:{todayEmotion:[{text:'집중이 잘 되었어요.',evidenceIds:['focus:good']},{text:'집중이 잘 된 하루였어요.',evidenceIds:['focus:good']}],clinicPhrase:{text:'오늘은 집중이 잘 되었어요.',evidenceIds:['focus:good']}}});
};
assert.equal((await requestPreviewMoodAnalysis(input,'synthetic','',id,fetchResult)).status,503);assert.equal(transportCalls,0);
assert.equal((await requestPreviewMoodAnalysis(input,'synthetic','synthetic-access',id,fetchResult)).status,200);
for(const status of [401,403,422,503]){
 const response=await requestPreviewMoodAnalysis(input,'synthetic','synthetic-access',id,async()=>Response.json({secret:'must-not-escape'}, {status}));
 assert.equal(response.status,status===401?401:status===422?422:502);assert.ok(!(await response.text()).includes('must-not-escape'));
}
for(const output of ['<html>Login</html>',JSON.stringify({model:'preview-local'}),'x'.repeat(33000)])assert.equal((await requestPreviewMoodAnalysis(input,'synthetic','synthetic-access',id,async()=>new Response(output))).status,502);
assert.equal((await requestPreviewMoodAnalysis(input,'synthetic','synthetic-access',id,async()=>{throw new Error('do-not-log-token');})).status,502);
console.log('PASS Native AI auth-before-relay, fixed Preview target, no cookie/URL secrets, no redirects, bounded/validated result and sanitized failures');
