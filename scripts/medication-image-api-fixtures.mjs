import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from '../apps/native/node_modules/esbuild/lib/main.js';
import { createRequire } from 'node:module';
import { storedMfdsImageCandidates, getVerifiedMedicationImage } from '../lib/medication-image-service.ts';
import { getMfdsImageCandidates, MfdsConfigurationError, normalizeMfdsImageRequest } from '../lib/mfds-medications.ts';
import { resolveMedicationImage, getLocalMedicationProductImage } from '../lib/medication-images.ts';
const require = createRequire(import.meta.url);
let checks = 0;
const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const jpeg = new Uint8Array([255,216,255,224,0,1,2,3,4,5,6,7,8]);
const imageUrl = 'https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/1OiAjxwzC-Y';
const catalogUrl = 'https://nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/fixture-catalog-025';
const itemSequence = '198702209';
const row = {catalog_id:itemSequence,name:'자나팜정',display_label:'자나팜정 0.25mg',strength_value:0.25,strength_unit:'mg',manufacturer:'명인제약(주)',official_match_status:'matched',image_source_name:'식품의약품안전처 의약품 낱알식별정보',image_source_url:imageUrl};
const candidate = {source:'pill',originalUrl:imageUrl};
eq(storedMfdsImageCandidates(itemSequence,[row]),[candidate]);
for (const override of [
  {catalog_id:'198702210'}, {display_label:'자니팜정 0.25mg'}, {strength_value:0.5},
  {name:'자나팜캡슐'}, {official_match_status:'ambiguous'}, {manufacturer:null},
  {image_source_url:'https://example.com/pill.jpg'}, {image_source_url:'https://nedrug.mfds.go.kr/page'},
  {image_source_url:'https://name:password@nedrug.mfds.go.kr/pbp/cmn/itemImageDownload/fixture-025'},
  {image_source_url:'https://nedrug.mfds.go.kr:8443/pbp/cmn/itemImageDownload/fixture-025'},
  {image_source_name:'출처 불명'}, {strength_value:0},
]) eq(storedMfdsImageCandidates(itemSequence,[{...row,...override}]),[]);
eq(storedMfdsImageCandidates(itemSequence,[row,{...row,display_label:'자나팜정 0.5mg',strength_value:0.5}]),[]);
eq(storedMfdsImageCandidates(itemSequence,[{...row,display_label:'자나팜정 0.5mg',strength_value:0.5}]),[]);
eq(normalizeMfdsImageRequest('https://username@nedrug.mfds.go.kr/x'),undefined);
eq(getLocalMedicationProductImage({medicationId:'201111088',medicationName:'메디키넷리타드캡슐 20mg'}),undefined);
const generic={type:'fallback',src:'/icons/medication-fallback-64.svg'};
const resolver={medicationId:itemSequence,medicationName:'자나팜정 0.25mg',existingImage:'/broken-saved.jpg',catalogImage:'/api/medications/image/'+itemSequence};
eq(resolveMedicationImage(resolver),{type:'product',src:'/broken-saved.jpg'});
eq(resolveMedicationImage({...resolver,failedSources:new Set(['/broken-saved.jpg'])}),{type:'product',src:resolver.catalogImage});
eq(resolveMedicationImage({...resolver,failedSources:new Set(['/broken-saved.jpg',resolver.catalogImage])}),generic);
eq(resolveMedicationImage({...resolver,existingImage:undefined,catalogImage:'/api/medications/image/198702210'}),generic);
eq(resolveMedicationImage({medicationId:'201111088',medicationName:'메디키넷리타드캡슐 10mg',catalogImage:'/api/medications/image/201111088'}),{type:'product',src:'/medications/medikinet-10.jpg'});

function metadataClient(rows=[row]) {
  const calls=[];
  const client={from(table) { calls.push(['from',table]); const query={select:(columns)=>{calls.push(['select',columns]);return query;},eq:(key,value)=>{calls.push(['eq',key,value]);return query;},order:()=>query,limit:async()=>({data:rows,error:null})}; return query; }};
  return {client,calls};
}
function imageResponse(url) { const response=new Response(jpeg,{headers:{'content-type':'image/jpeg'}}); Object.defineProperty(response,'url',{value:url}); return response; }
function metadataResponse(url, id=itemSequence) { return Response.json({response:{body:{items:[{ITEM_SEQ:id,ITEM_NAME:'자나팜정0.25밀리그램(알프라졸람)',ITEM_IMAGE:url}]}}}); }
const originalFetch=globalThis.fetch;
const oldKeys={product:process.env.MFDS_SERVICE_KEY,pill:process.env.MFDS_PILL_IDENTIFICATION_SERVICE_KEY};
try {
  delete process.env.MFDS_SERVICE_KEY; delete process.env.MFDS_PILL_IDENTIFICATION_SERVICE_KEY;
  let calls=[];
  globalThis.fetch=async input=>{calls.push(String(input));return imageResponse(String(input));};
  const db=metadataClient();
  const image=await getVerifiedMedicationImage(itemSequence,db.client,'inspection-owner');
  eq(image.status,200); eq(image.contentType,'image/jpeg'); eq(calls,[imageUrl]);
  eq(db.calls.filter(c=>c[0]==='eq'),[['eq','user_id','inspection-owner'],['eq','catalog_id',itemSequence]]);
  const malformed=await getVerifiedMedicationImage(itemSequence,metadataClient([{...row,strength_value:0.5}]).client,'inspection-owner');
  eq(malformed,null);
  const conflicted=await getVerifiedMedicationImage(itemSequence,metadataClient([row,{...row,display_label:'자나팜정 0.5mg',strength_value:0.5}]).client,'inspection-owner');
  eq(conflicted,null);
  eq(await getVerifiedMedicationImage(itemSequence,metadataClient([{...row,display_label:'자나팜정 0.5mg',strength_value:0.5}]).client,'inspection-owner'),null);
  eq((await getVerifiedMedicationImage(itemSequence,metadataClient([]).client,'inspection-owner')).finalUrl,imageUrl);
  await assert.rejects(getMfdsImageCandidates(itemSequence),MfdsConfigurationError); checks++;
  eq(calls.length,2);

  process.env.MFDS_SERVICE_KEY='synthetic-product-key';
  globalThis.fetch=async input=>metadataResponse(catalogUrl);
  eq(await getMfdsImageCandidates(itemSequence),[{source:'product',originalUrl:catalogUrl}]);
  delete process.env.MFDS_SERVICE_KEY; process.env.MFDS_PILL_IDENTIFICATION_SERVICE_KEY='synthetic-pill-key';
  eq(await getMfdsImageCandidates(itemSequence),[{source:'pill',originalUrl:catalogUrl}]);
  process.env.MFDS_SERVICE_KEY='synthetic-product-key';
  globalThis.fetch=async input=>String(input).includes('MdcinGrnIdntfc')?new Response('upstream failed',{status:502}):metadataResponse(catalogUrl);
  eq(await getMfdsImageCandidates(itemSequence),[{source:'product',originalUrl:catalogUrl}]);
  globalThis.fetch=async input=>String(input).includes('DrugPrdtPrmsn')?new Response('upstream failed',{status:502}):metadataResponse(catalogUrl);
  eq(await getMfdsImageCandidates(itemSequence),[{source:'pill',originalUrl:catalogUrl}]);
  globalThis.fetch=async()=>metadataResponse(catalogUrl,'198702210');
  eq(await getMfdsImageCandidates(itemSequence),[]);
  calls=[];
  globalThis.fetch=async input=>{
    const url=String(input); calls.push(url);
    if(url===imageUrl)return new Response('failed',{status:502});
    if(url===catalogUrl)return imageResponse(url);
    return metadataResponse(catalogUrl);
  };
  eq((await getVerifiedMedicationImage(itemSequence,metadataClient().client,'inspection-owner')).finalUrl,catalogUrl);
  eq(calls.filter(url=>url===catalogUrl).length,1);

  const compiled=await build({entryPoints:['lib/native-api/server.ts'],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'fixture-supabase-client',setup(b){b.onResolve({filter:/^@\/lib\/supabase\/client$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function createBrowserSupabaseClient(){throw Error("unexpected_browser_client");}',loader:'js'}));}}]});
  const mod={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(require,mod,mod.exports);
  delete process.env.MFDS_SERVICE_KEY;delete process.env.MFDS_PILL_IDENTIFICATION_SERVICE_KEY;
  globalThis.fetch=async input=>imageResponse(String(input));
  const deps={supabaseUrl:'https://qa.supabase.co',expectedSupabaseUrl:'https://qa.supabase.co',authenticate:async()=>({user:{id:'inspection-owner',is_anonymous:false},client:metadataClient().client}),admin:()=>{throw Error('admin_access_forbidden');}};
  const handler=mod.exports.createNativeApiHandler(deps);
  const request=()=>new Request('https://qa.supabase.co/functions/v1/native-api/medications/image/'+itemSequence,{headers:{authorization:'Bearer inspection-token',origin:'https://localhost'}});
  const response=await handler(request());
  eq(response.status,200);eq(response.headers.get('content-type'),'image/jpeg');eq(response.headers.get('access-control-allow-origin'),'https://localhost');
  eq(new Uint8Array(await response.arrayBuffer()),jpeg);
  eq((await handler(new Request(request().url))).status,401);
  eq((await handler(new Request(request().url,{headers:{authorization:'Bearer inspection-token',origin:'https://evil.example'}}))).status,403);
  const noMetadata=mod.exports.createNativeApiHandler({...deps,authenticate:async()=>({user:{id:'inspection-owner'},client:metadataClient([]).client})});
  const unavailable=await noMetadata(new Request('https://qa.supabase.co/functions/v1/native-api/medications/image/198702210',{headers:{authorization:'Bearer inspection-token',origin:'https://localhost'}}));
  eq(unavailable.status,503);eq(await unavailable.json(),{code:'IMAGE_SERVICE_NOT_CONFIGURED'});
} finally {
  globalThis.fetch=originalFetch;
  for (const [name,value] of [['MFDS_SERVICE_KEY',oldKeys.product],['MFDS_PILL_IDENTIFICATION_SERVICE_KEY',oldKeys.pill]]) {
    if(value===undefined)delete process.env[name];else process.env[name]=value;
  }
}
console.log('PASS '+checks+' medication image API assertions');
