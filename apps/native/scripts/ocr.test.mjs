import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
async function load(){const out=await build({entryPoints:['src/platform/ocr.ts'],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'ocr-failure-fixture',setup(b){b.onResolve({filter:/^tesseract.js$/},()=>({path:'ocr',namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},()=>({loader:'js',contents:`export const createWorker=async(l,o,options)=>{globalThis.__ocr.options=options;if(globalThis.__ocr.fail){queueMicrotask(()=>options.errorHandler(Error('language unavailable')));return new Promise(()=>{})}return {terminate:async()=>{}}};`}));}}]});const m={exports:{}};new Function('require','module','exports',out.outputFiles[0].text)(require,m,m.exports);return m.exports;}
test('failed language initialization rejects Native OCR instead of hanging its loading UI',async()=>{globalThis.__ocr={fail:true};const {createNativeOcrWorker}=await load();await assert.rejects(createNativeOcrWorker(),/native_ocr_load_failed/);assert.equal(__ocr.options.gzip,false);assert.equal(__ocr.options.workerBlobURL,false);});
test('successful bundled worker initialization remains usable',async()=>{globalThis.__ocr={fail:false};const {createNativeOcrWorker}=await load();const worker=await createNativeOcrWorker();await worker.terminate();assert.equal(__ocr.options.langPath,'/ocr/lang');});
