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
