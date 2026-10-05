import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const root=fileURLToPath(new URL('../../../',import.meta.url));
const fixture=resolve(root,'apps/native/scripts/date-context/fixtures.mjs');
async function loadHome(){
 const result=await build({stdin:{contents:`export {HomeScreen} from './components/home-screen';`,resolveDir:root,loader:'tsx'},bundle:true,platform:'node',format:'cjs',jsx:'automatic',write:false,packages:'external',alias:{'@':root},plugins:[{name:'ssr-fixtures',setup(b){
  b.onResolve({filter:/\.module\.css$/},()=>({path:'styles',namespace:'fake-css'}));
  b.onLoad({filter:/.*/,namespace:'fake-css'},()=>({contents:'export default {thumbnail: "medication-thumbnail"};',loader:'js'}));
  b.onResolve({filter:/^\.\/mixpanel$/},()=>({path:'analytics',namespace:'fake-analytics'}));
  b.onLoad({filter:/.*/,namespace:'fake-analytics'},()=>({contents:'export const trackAnalyticsEvent=()=>false;',loader:'js'}));
  b.onResolve({filter:/^(next\/|@\/lib\/(auth\/client|repositories|notifications|medication-enrichment|analytics\/events))/},a=>{
   if(a.path.startsWith('next/'))return {path:a.path,namespace:'fake-next'};
   return {path:a.path==='@/lib/analytics/events'?resolve(root,'apps/native/src/adapters/analytics.ts'):fixture};
  });
  b.onLoad({filter:/.*/,namespace:'fake-next'},a=>({loader:'js',resolveDir:root,contents:a.path==='next/navigation'?`exports.useRouter=()=>({});`:`const React=require('react');module.exports=({children,priority,fill,unoptimized,...p})=>React.createElement('${a.path==='next/link'?'a':'img'}',p,children);`}));
 }}]});
 const mod={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,mod,mod.exports);return mod.exports.HomeScreen;
}
const Home=await loadHome();
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const user={id:'verified-qa',user_metadata:{name:'검증회원'},app_metadata:{}};
const firstFrame=props=>renderToStaticMarkup(React.createElement(Home,{initialDateKey:'2026-09-17',...props}));
test('verified member first Home render includes name before repository effects',()=>{
 const html=firstFrame({initialAuthState:{isAuthenticated:true,user}});assert.match(html,/검증회원님 반가워요/);assert.doesNotMatch(html,/로그인이 필요해요/);
});
test('pending auth first Home render is neutral, not signed out',()=>{
 const html=firstFrame({});assert.doesNotMatch(html,/로그인이 필요해요|skeleton|shimmer/);assert.match(html,/home-profile-link/);
});
test('verified guest retains the existing Home login prompt',()=>{
 assert.match(firstFrame({initialAuthState:{isAuthenticated:false,user:null}}),/로그인이 필요해요/);
});
