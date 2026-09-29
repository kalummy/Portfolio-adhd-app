import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
async function load(token='synthetic-unit-token',stage='development',productionToken='') {
 const output=await build({entryPoints:['src/adapters/analytics-transport.ts'],bundle:true,platform:'node',format:'cjs',write:false,define:{'import.meta.env.VITE_NATIVE_STAGE':JSON.stringify(stage),'import.meta.env.VITE_NATIVE_MIXPANEL_TOKEN':JSON.stringify(token),'import.meta.env.VITE_NATIVE_PRODUCTION_MIXPANEL_TOKEN':JSON.stringify(productionToken)},plugins:[{name:'capture-only',setup(b){b.onResolve({filter:/^@capacitor\/core$/},()=>({path:'capture',namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:'export const CapacitorHttp={post:async data=>{globalThis.__analyticsSends.push(data);return {status:200,data:1}}};',loader:'js'}));}}]});
 const mod={exports:{}};new Function('require','module','exports',output.outputFiles[0].text)(require,mod,mod.exports);return mod.exports;
}
test('Native sends existing taxonomy once, filters health data, resets anonymous identity',async()=>{
 globalThis.__analyticsSends=[];globalThis.location={pathname:'/'};const data=new Map();globalThis.localStorage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const a=await load();assert.equal(a.trackAppOpened(),true);assert.equal(a.trackAppOpened(),false);
 assert.equal(__analyticsSends.length,1);const first=__analyticsSends[0];assert.equal(first.data[0].event,'app_opened');assert.equal(first.data[0].properties.environment,'development');assert.match(first.url,/ip=0/);assert.equal(first.data[0].properties.token,'synthetic-unit-token');
 a.trackAnalyticsEvent('medication_taken','member',{name:'private medicine',email:'private@example.invalid'});
 assert.doesNotMatch(JSON.stringify(__analyticsSends),/private medicine|private@example/);
 const old=first.data[0].properties.distinct_id;a.resetAnalyticsIdentity();a.trackAnalyticsEvent('login_completed','member',{});assert.notEqual(__analyticsSends.at(-1).data[0].properties.distinct_id,old);
 location.pathname='/preview';assert.equal(a.trackAnalyticsEvent('app_opened','unknown',{}),false);
 assert.equal(new Set(__analyticsSends.map(x=>x.data[0].properties.$insert_id)).size,__analyticsSends.length);
});
test('missing Dev configuration sends nothing, never falls back to Production',async()=>{
 globalThis.__analyticsSends=[];globalThis.location={pathname:'/'};const a=await load('');assert.equal(a.trackAppOpened(),false);assert.equal(__analyticsSends.length,0);
});
test('Production Analytics requires its own token and labels events Production',async()=>{
 globalThis.__analyticsSends=[];globalThis.location={pathname:'/'};globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
 const missing=await load('dev-token','production','');assert.equal(missing.trackAppOpened(),false);
 const configured=await load('dev-token','production','prod-token');assert.equal(configured.trackAppOpened(),true);
 assert.equal(__analyticsSends.length,1);assert.equal(__analyticsSends[0].data[0].properties.token,'prod-token');
 assert.equal(__analyticsSends[0].data[0].properties.environment,'production');
});
