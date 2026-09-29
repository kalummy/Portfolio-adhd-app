import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';

async function adapter(file, qa) {
 globalThis.__DATA_CACHE_TEST__=qa;
 globalThis.window=new EventTarget();globalThis.document=new EventTarget();
 const result=await build({entryPoints:[file],bundle:true,write:false,platform:'node',format:'esm',alias:{'@':resolve('../..')},plugins:[{
  name:'qa-boundaries',setup(b){
   b.onResolve({filter:/auth\/runtime$/},()=>({path:'auth',namespace:'qa'}));
   b.onResolve({filter:/api\/client$/},()=>({path:'http',namespace:'qa'}));
   b.onResolve({filter:/^\.\.\/\.\.\/\.\.\/\.\.\/lib\/notifications$/},()=>({path:'notifications',namespace:'qa'}));
   b.onLoad({filter:/.*/,namespace:'qa'},({path})=>({contents:path==='auth'?`export const getNativeAuthSnapshot=()=>globalThis.__DATA_CACHE_TEST__.auth;export const subscribeNativeAuth=fn=>{globalThis.__DATA_CACHE_TEST__.listeners.push(fn);return()=>{};};`:path==='http'?`export const fetchNativeApi=(...args)=>globalThis.__DATA_CACHE_TEST__.fetch(...args);`:`export const hasUnreadNotifications=(...args)=>globalThis.__DATA_CACHE_TEST__.unread(...args);`,loader:'js'}));
  },
 }]});return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text+'\n// '+file).toString('base64'));
}
test('actual repository adapter: derived reads, targeted invalidation, fresh DB readback and failed mutation retry',async()=>{
 const calls=[];let fail=false;const qa={auth:{status:'signed_in',user:{id:'owner'}},listeners:[],fetch:async(_path,init)=>{
  const b=JSON.parse(init.body);calls.push(b);
  if(fail&&b.method==='updateRecordedAt')throw Error('network');
  const data=b.repository==='medications'?[{id:'one',active:true},{id:'two',active:false}]:b.repository==='medicationIntakes'?[{medicationId:'one',date:'2026-09-16',recordedAt:'2026-09-16T00:00:00Z'}]:b.repository==='moods'?[]:null;
  return Response.json({data});
 }};
 const api=await adapter('src/adapters/repositories.ts',qa);await api.prefetchNativeHome();assert.equal(calls.length,4);
 const r=await api.getDataRepositories();assert.equal((await r.medications.listActive()).length,1);assert.equal(await r.medicationIntakes.hasHistory('one'),true);await r.medicationIntakes.listByDate('2026-09-16');await r.moods.listRecent('2026-09-01','2026-09-30');assert.equal(calls.length,4);
 await r.medicationIntakes.updateRecordedAt('one','2026-09-16','2026-09-16T01:30:00Z');
 await r.medicationIntakes.listByDate('2026-09-16');await api.prefetchNativeHome();
 assert.deepEqual(calls.slice(4).map(x=>[x.repository,x.method]),[['medicationIntakes','updateRecordedAt'],['medicationIntakes','listByDate'],['medicationIntakes','listAll']]);
 fail=true;await assert.rejects(r.medicationIntakes.updateRecordedAt('one','2026-09-16','x'));fail=false;
 await r.medicationIntakes.listAll();assert.equal(calls.at(-1).method,'listAll');
 const before=calls.length;window.dispatchEvent(new Event('focus'));await api.prefetchNativeHome();assert.equal(calls.length-before,4);
 qa.auth={status:'signed_out',user:null};qa.listeners.forEach(fn=>fn());await assert.rejects(r.medications.listAll(),/account_changed/);
 qa.auth={status:'signed_in',user:{id:'owner'}};qa.listeners.forEach(fn=>fn());const last=calls.length;await api.prefetchNativeHome();assert.equal(calls.length-last,4);
});
test('actual unread adapter merges overlapping events but never caches results or crosses accounts',async()=>{
 let resolveRead,calls=0;const qa={auth:{status:'signed_in',user:{id:'one'}},listeners:[],unread:()=>{calls++;return new Promise(r=>{resolveRead=r;});}};
 const api=await adapter('src/adapters/notifications.ts',qa);
 const a=api.hasUnreadNotifications(),b=api.hasUnreadNotifications(),c=api.hasUnreadNotifications();assert.equal(calls,1);resolveRead(true);assert.deepEqual(await Promise.all([a,b,c]),[true,true,true]);
 const next=api.hasUnreadNotifications();assert.equal(calls,2);const rejected=assert.rejects(next,/account_changed/);qa.auth.user={id:'two'};qa.listeners.forEach(fn=>fn());resolveRead(false);await rejected;
 const fresh=api.hasUnreadNotifications();assert.equal(calls,3);resolveRead(false);assert.equal(await fresh,false);
});
