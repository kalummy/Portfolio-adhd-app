import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(new URL('../apps/native/package.json',import.meta.url));
const esbuild=require('esbuild');
let sdkCode;

export function memoryStorage(){
 const values={};
 Object.defineProperties(values,{
  length:{get:()=>Object.keys(values).length},
  getItem:{configurable:true,value:key=>Object.hasOwn(values,key)?values[key]:null},
  setItem:{configurable:true,value:(key,value)=>Object.defineProperty(values,key,{value:String(value),enumerable:true,writable:true,configurable:true})},
  removeItem:{configurable:true,value:key=>delete values[key]},key:{configurable:true,value:i=>Object.keys(values)[i]??null},
 });return values;
}

export function createEnvironment(sharedStorage=memoryStorage()){
 const listeners=new Map(),timers=new Set(),localStorage=sharedStorage,sessionStorage=memoryStorage();
 const location={href:'https://synthetic.invalid/',origin:'https://synthetic.invalid',hostname:'synthetic.invalid',host:'synthetic.invalid',pathname:'/',search:'',hash:'',protocol:'https:'};
 let cookie='';
 const document={readyState:'complete',location,referrer:'',title:'Synthetic privacy fixture',documentElement:{removeAttribute(){}},addEventListener(){},removeEventListener(){},getElementsByTagName:()=>[],querySelectorAll:()=>[],createElement:tag=>tag==='a'?{set href(x){this.url=new URL(x,location.href)},get hostname(){return this.url?.hostname??''},get pathname(){return this.url?.pathname??''},get search(){return this.url?.search??''},get protocol(){return this.url?.protocol??''}}:{style:{},setAttribute(){},appendChild(){},addEventListener(){}}};
 Object.defineProperty(document,'cookie',{get:()=>cookie,set:value=>{cookie=value}});
 const h={user:{id:'SYNTHETIC_A'},sent:[],authCalls:0,dbCalls:0,authError:null,dbError:false,deferAuth:false,resolveAuth:null,logs:0,localStorage,sessionStorage,location,listeners};
 h.client={auth:{getUser:async()=>h.deferAuth?new Promise(resolve=>{h.resolveAuth=resolve}):{data:{user:h.user},error:null},signOut:async()=>{h.authCalls++;if(h.authError)return{error:h.authError};h.user=null;return{error:null}}}};
 class XHR{constructor(){this.withCredentials=true}open(){throw Error('NETWORK_FORBIDDEN')}setRequestHeader(){}send(){throw Error('NETWORK_FORBIDDEN')}}
 const setTimer=(fn,ms=0)=>{if(ms>=3000)return {sdkTimer:true};const id=setTimeout(fn,ms);timers.add(id);return id};
 const clearTimer=id=>{if(typeof id==='object'&&id?.sdkTimer)return;clearTimeout(id);timers.delete(id)};
 const win={document,location,localStorage,sessionStorage,navigator:{userAgent:'Mozilla/5.0 Synthetic Chrome/131.0',onLine:true,language:'ko-KR',doNotTrack:'0'},screen:{width:390,height:844},crypto:crypto.webcrypto,performance:{now:()=>0},addEventListener:(type,fn)=>{let set=listeners.get(type);if(!set)listeners.set(type,set=new Set());set.add(fn)},removeEventListener:(type,fn)=>listeners.get(type)?.delete(fn),dispatchEvent(){},history:{replaceState(){}},CustomEvent:class{},XMLHttpRequest:XHR,fetch:async()=>{throw Error('NETWORK_FORBIDDEN')},setTimeout:setTimer,clearTimeout:clearTimer};
 const context=vm.createContext({...win,window:win,self:win,console:{log(){h.logs++},warn(){h.logs++},error(){h.logs++}},URL,URLSearchParams,TextEncoder,TextDecoder,AbortController,Uint8Array,ArrayBuffer,Date,Promise,Math,JSON,Buffer,setInterval:()=>0,clearInterval(){},queueMicrotask,process:{env:{NEXT_PUBLIC_MIXPANEL_TOKEN:'SYNTHETIC_PUBLIC_PROJECT',NEXT_PUBLIC_VERCEL_ENV:'development'}},__h:h});
 context.globalThis=context;win.globalThis=context;h.context=context;
 h.dispose=()=>{for(const id of timers)clearTimeout(id);for(const batcher of Object.values(h.sdk?.request_batchers??{}))batcher.stop()};
 h.storageEvent=key=>{for(const fn of listeners.get('storage')??[])fn({key,newValue:localStorage.getItem(key),storageArea:localStorage})};
 return h;
}

export async function loadWeb(h,{reuseSdk=false}={}){
 if(!sdkCode){const built=await esbuild.build({entryPoints:[path.join(root,'node_modules/mixpanel-browser/src/loaders/loader-module-core.js')],bundle:true,platform:'browser',format:'cjs',write:false,logLevel:'silent'});sdkCode=built.outputFiles[0].text}
 if(!reuseSdk){h.context.module={exports:{}};vm.runInContext(sdkCode,h.context);h.sdk=h.context.module.exports.default;h.context.__sdk=h.sdk;}
 // Only platform/provider boundaries are replaced. The SDK and all app lifecycle
 // methods under test are the current worktree source, not copied implementations.
 const stubs={sdk:'export default globalThis.__sdk;',sdkPackage:'export default {version:globalThis.__h.sdkVersion??"2.82.0"};',supabase:'export const createBrowserSupabaseClient=()=>globalThis.__h.client;',config:'export const isSupabaseConfigured=()=>true;',profile:'export const ADDI_PROFILE_METADATA_KEY="addi_profile";',idb:'export const clearAddiIndexedDatabase=async()=>{globalThis.__h.dbCalls++;if(globalThis.__h.dbError)throw Error("SYNTHETIC_DB_FAILURE")};',draft:'export const readMoodDraft=()=>null;'};
 const built=await esbuild.build({stdin:{contents:"export * as analytics from './lib/analytics/mixpanel';export * as auth from './lib/auth/client';export * as deletion from './lib/account-deletion-local';export * as events from './lib/analytics/events';",resolveDir:root,sourcefile:'privacy-fixture.ts',loader:'ts'},bundle:true,platform:'browser',format:'cjs',write:false,logLevel:'silent',plugins:[{name:'controlled-boundaries',setup(build){
  build.onResolve({filter:/.*/},args=>{
   const key=args.path==='mixpanel-browser/package.json'?'sdkPackage':args.path.startsWith('mixpanel-browser/src/loaders/')?'sdk':({'@/lib/supabase/client':'supabase','@/lib/supabase/config':'config','@/lib/profile':'profile','@/lib/indexed-db':'idb'})[args.path]??(args.path==='../mood-draft'&&args.importer.endsWith('/analytics/events.ts')?'draft':null);
   if(key)return{path:key,namespace:'fixture'};
   if(args.path.startsWith('@/'))return{path:path.join(root,args.path.slice(2))+'.ts'};
  });
  build.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:stubs[args.path],loader:'ts'}));
 }}]});
 h.context.module={exports:{}};vm.runInContext(built.outputFiles[0].text,h.context);h.web=h.context.module.exports;
 h.sdk._send_request=(_endpoint,encoded,_options,callback)=>{h.sent.push(encoded);callback?.({status:1});return true};
 return h.web;
}
export async function settle(turns=80){for(let i=0;i<turns;i++)await Promise.resolve()}
export function packets(h){return h.sent.flatMap(encoded=>{const text=encoded.data;try{return JSON.parse(text)}catch{return JSON.parse(Buffer.from(text,'base64').toString())}})}
export async function runCases(cases){
 const result=[];
 for(const [name,fn]of cases){try{await fn();result.push({name,status:'PASS'})}catch(error){result.push({name,status:'FAIL',failureType:error.name});console.error(name+': '+error.name);}}
 console.log(JSON.stringify({scope:'LOCAL_ACTUAL_SOURCE_SDK_MOCK_AUTH_STORAGE_TRANSPORT',networkRequests:0,cases:result}));
 if(result.some(x=>x.status==='FAIL'))process.exitCode=1;
}

export const sessionCases=[
 ['Web A logout B rotates anonymous identity and clears markers',async()=>{const h=createEnvironment();try{const w=await loadWeb(h);assert.equal(w.analytics.initAnalytics(),true);w.events.trackLoginCompleted();await settle();const old=h.sdk.get_distinct_id();h.sessionStorage.setItem('addi:analytics:login-completed:v1','1');await w.auth.signOut();assert.notEqual(h.sdk.get_distinct_id(),old);assert.equal(h.sessionStorage.getItem('addi:analytics:login-completed:v1'),null);h.user={id:'SYNTHETIC_B'};w.events.trackLoginStarted();await settle();const entries=h.sdk.request_batchers.events.queue.memQueue;assert.notEqual(entries.at(-1).payload.properties.distinct_id,old)}finally{h.dispose()}}],
 ['Delayed pre-logout Auth response cannot dispatch into the next lifecycle',async()=>{const h=createEnvironment();try{const w=await loadWeb(h);w.analytics.initAnalytics();h.deferAuth=true;w.events.trackScreenViewed('/moods');await settle();assert.equal(typeof h.resolveAuth,'function');await w.auth.signOut();h.deferAuth=false;h.user={id:'SYNTHETIC_B'};h.resolveAuth({data:{user:{id:'SYNTHETIC_A'}},error:null});await settle();assert.equal(h.sdk.request_batchers.events.queue.memQueue.length,0)}finally{h.dispose()}}],
 ['Analytics reset failure never skips Auth or sends the previous identity',async()=>{const h=createEnvironment();try{const w=await loadWeb(h);w.analytics.trackAnalyticsEvent('medication_taken','member',{});await settle();const old=h.sdk.get_distinct_id(),reset=h.sdk.reset.bind(h.sdk);h.sdk.reset=()=>{throw Error('SYNTHETIC_RESET_FAILURE')};await w.auth.signOut();assert.equal(h.authCalls,1);assert.equal(h.user,null);assert.equal(w.analytics.trackAnalyticsEvent('medication_taken','guest',{}),false);await h.sdk.request_batchers.events.flush();await settle();assert.equal(h.sent.length,0);h.sdk.reset=reset;h.user={id:'SYNTHETIC_B'};h.location.search='?analyticsLoginCompleted=1';h.location.href=h.location.origin+'/'+h.location.search;await w.auth.getAuthState();assert.notEqual(h.sdk.get_distinct_id(),old);assert.equal(w.analytics.trackAnalyticsEvent('medication_taken','member',{}),true)}finally{h.dispose()}}],
 ['SDK unconfigured still permits normal Auth logout',async()=>{const h=createEnvironment();try{h.context.process.env.NEXT_PUBLIC_MIXPANEL_TOKEN='';const w=await loadWeb(h);await w.auth.signOut();assert.equal(h.authCalls,1)}finally{h.dispose()}}],
 ['Existing explicit analytics opt-out is preserved at logout',async()=>{const h=createEnvironment();try{const w=await loadWeb(h);w.analytics.initAnalytics();h.sdk.opt_out_tracking({clear_persistence:true,delete_user:false});await settle();await w.auth.signOut();assert.equal(h.sdk.has_opted_out_tracking(),true)}finally{h.dispose()}}],
 ['Normal guest/member tracking keeps filtered properties and no internal epoch',async()=>{const h=createEnvironment();try{const w=await loadWeb(h);assert.equal(w.analytics.trackAnalyticsEvent('medication_taken','guest',{}),true);await settle();await h.sdk.request_batchers.events.flush();await settle();assert.equal(h.sent.length,1);for(const packet of packets(h)){assert.equal(Object.keys(packet.properties).some(k=>k.startsWith('__addi')),false);assert.equal(Object.hasOwn(packet.properties,'email'),false)}}finally{h.dispose()}}],
 ['Legacy initialized singleton acquires privacy state and a send hook safely',async()=>{const h=createEnvironment();try{const w=await loadWeb(h);w.analytics.initAnalytics();h.sdk.set_config({hooks:{}});h.context.__addiAnalyticsState={initialized:true,appOpenedTracked:false};const upgraded=await loadWeb(h,{reuseSdk:true});assert.equal(upgraded.analytics.trackAnalyticsEvent('medication_taken','guest',{}),true);await settle();await h.sdk.request_batchers.events.flush();await settle();assert.equal(h.sent.length,1);assert.ok(packets(h).every(x=>Object.keys(x.properties).every(k=>!k.startsWith('__addi'))))}finally{h.dispose()}}],
 ['Storage recovery and a verified new sign-in restore ID separation and collection',async()=>{const target=memoryStorage(),fault={blocked:false};const storage=new Proxy(target,{get(object,key){if(key==='getItem')return name=>{if(fault.blocked)throw Error('SYNTHETIC_STORAGE_FAILURE');return object.getItem(name)};if(key==='setItem')return(name,value)=>{if(fault.blocked)throw Error('SYNTHETIC_STORAGE_FAILURE');return object.setItem(name,value)};return Reflect.get(object,key)}});const h=createEnvironment(storage);try{const w=await loadWeb(h);w.analytics.initAnalytics();const old=h.sdk.get_distinct_id();fault.blocked=true;await w.auth.signOut();assert.equal(h.authCalls,1);assert.equal(w.analytics.trackAnalyticsEvent('medication_taken','guest',{}),false);fault.blocked=false;h.user={id:'SYNTHETIC_B'};h.location.search='?analyticsLoginCompleted=1';h.location.href=h.location.origin+'/'+h.location.search;await w.auth.getAuthState();assert.notEqual(h.sdk.get_distinct_id(),old);assert.equal(w.analytics.trackAnalyticsEvent('medication_taken','member',{}),true)}finally{h.dispose()}}],
 ['First Auth reads and a normal reload preserve the existing anonymous identity',async()=>{const h=createEnvironment();let reloaded;try{const w=await loadWeb(h);w.analytics.initAnalytics();const id=h.sdk.get_distinct_id();await w.auth.getAuthState();await w.auth.getCurrentUser();assert.equal(h.sdk.get_distinct_id(),id);reloaded=createEnvironment(h.localStorage);const next=await loadWeb(reloaded);next.analytics.initAnalytics();await next.auth.getAuthState();assert.equal(reloaded.sdk.get_distinct_id(),id)}finally{h.dispose();reloaded?.dispose()}}],
 ['Other-tab logout resets an old SDK identity before its first Auth read',async()=>{const a=createEnvironment();let b;try{const wa=await loadWeb(a);wa.analytics.initAnalytics();b=createEnvironment(a.localStorage);const wb=await loadWeb(b);wb.analytics.initAnalytics();const old=b.sdk.get_distinct_id();await wa.auth.signOut();b.storageEvent('addi_privacy_analytics_boundary_v1');await settle();b.user={id:'SYNTHETIC_B'};assert.equal((await wb.auth.getAuthState()).isAuthenticated,true);assert.notEqual(b.sdk.get_distinct_id(),old);wb.events.trackLoginStarted();await settle();await b.sdk.request_batchers.events.flush();await settle();assert.ok(packets(b).every(x=>x.properties.distinct_id!==old))}finally{a.dispose();b?.dispose()}}],
 ['Missing SDK configuration preserves a deferred logout identity reset',async()=>{const h=createEnvironment();try{h.context.process.env.NEXT_PUBLIC_MIXPANEL_TOKEN='';const w=await loadWeb(h);await w.auth.signOut();h.user={id:'SYNTHETIC_B'};h.location.search='?analyticsLoginCompleted=1';h.location.href=h.location.origin+'/'+h.location.search;assert.equal((await w.auth.getAuthState()).isAuthenticated,true);let boundary=JSON.parse(h.localStorage.getItem('addi_privacy_analytics_boundary_v1'));assert.equal(boundary.resetRequired,true);h.context.process.env.NEXT_PUBLIC_MIXPANEL_TOKEN='SYNTHETIC_PUBLIC_PROJECT';await w.auth.getAuthState();boundary=JSON.parse(h.localStorage.getItem('addi_privacy_analytics_boundary_v1'));assert.equal(boundary.resetRequired,false);assert.equal(w.analytics.trackAnalyticsEvent('medication_taken','member',{}),true)}finally{h.dispose()}}],
 ['Malformed SDK memory packets are dropped before transport',async()=>{const h=createEnvironment();try{const w=await loadWeb(h);w.analytics.initAnalytics();const q=h.sdk.request_batchers.events.queue;q.memQueue.push({id:'SYNTHETIC_MALFORMED',flushAfter:0,payload:{event:'synthetic_broken'}});await h.sdk.request_batchers.events.flush();await settle();assert.equal(h.sent.length,0)}finally{h.dispose()}}],
];
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await runCases(sessionCases);
