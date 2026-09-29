import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../../../',import.meta.url));
async function load(path){const result=await build({entryPoints:[root+path],bundle:true,platform:'node',format:'cjs',packages:'external',alias:{'@':root},write:false});const mod={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,mod,mod.exports);return mod.exports;}
const href='/?date=2026-09-12&moodToast=saved&toastId=qa-once';
test('Native mood navigation preserves the document and date/toast query for push and replace',async()=>{
 const calls=[],oldWindow=globalThis.window,oldHistory=globalThis.history;
 globalThis.window={location:{origin:'https://localhost',assign:()=>assert.fail('document reload'),replace:()=>assert.fail('document reload')},addEventListener(){},scrollTo(){}};
 globalThis.history={pushState:(_,__,path)=>calls.push(['push',path]),replaceState:(_,__,path)=>calls.push(['replace',path])};
 try{const {navigateMoodHome}=await load('apps/native/src/platform/mood-navigation.ts');navigateMoodHome(href);navigateMoodHome(href,true);assert.deepEqual(calls,[['push',href],['replace',href]]);}finally{globalThis.window=oldWindow;globalThis.history=oldHistory;}
});
test('Web/TWA retain the prior assign/replace behavior',async()=>{
 const calls=[],oldWindow=globalThis.window;globalThis.window={location:{assign:x=>calls.push(['assign',x]),replace:x=>calls.push(['replace',x])}};
 try{const {navigateMoodHome}=await load('lib/mood-navigation.ts');navigateMoodHome(href);navigateMoodHome(href,true);assert.deepEqual(calls,[['assign',href],['replace',href]]);}finally{globalThis.window=oldWindow;}
});
