/** Creates and deletes only its own disposable Dev users. No production target accepted. */
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { randomUUID, randomBytes } from 'node:crypto';
const url='https://ohobxicxchkaisxxswkk.supabase.co';
assert.equal(process.env.ADDI_NATIVE_QA_URL,url,'Explicit Dev URL required');
assert.ok(process.env.ADDI_NATIVE_QA_SERVICE_KEY,'Dev server credential required');
const admin=createClient(url,process.env.ADDI_NATIVE_QA_SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ids=[];const clients=[];const checks=[];const mark=name=>{checks.push(name);console.log('PASS',name);};
async function api(token,path,body,method=body===undefined?'GET':'POST',expected=200,extra={}) {
 const res=await fetch(url+'/functions/v1/native-api/'+path,{method,headers:{authorization:`Bearer ${token}`,origin:'https://localhost',...(body===undefined?{}:{'content-type':'application/json'}),...extra},body:body===undefined?undefined:JSON.stringify(body)});
 assert.equal(res.status,expected,`HTTP ${res.status} for ${path.split('?')[0]}`);
 return res.status===204?null:res.json();
}
const repo=(token,repository,method,args=[],expected=200)=>api(token,'repository',{repository,method,args},'POST',expected).then(x=>x.data);
try {
 const tokens=[];
 for(let i=0;i<2;i++) {
  const email=`native-parity-qa-${randomUUID()}@example.invalid`; const password=randomBytes(32).toString('base64url');
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(error);ids.push(data.user.id);
  const client=createClient(url,process.env.ADDI_NATIVE_QA_SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const signed=await client.auth.signInWithPassword({email,password});assert.ifError(signed.error);tokens.push(signed.data.session.access_token);clients.push(client);
 }
 const [a,b]=tokens;const date='2026-09-15';const now=new Date().toISOString();
 await api('invalid','repository',{},'POST',401);await api(a,'repository',{},'POST',403,{origin:'https://evil.example'});
 await api(a,'repository',{repository:'medications',method:'listAll',args:[],user_id:ids[1]},'POST',400);mark('Bearer and origin/owner rejection');
 const medications=['daily','as-needed','bedtime'].map(schedule=>({id:randomUUID(),name:'Dev QA medication',strengthValue:10,strengthUnit:'mg',imagePath:'/icons/pill.svg',registrationMethod:'manual',schedule,createdAt:now,active:true}));
 assert.equal((await repo(a,'medications','createMany',[medications])).length,3);
 assert.equal((await repo(b,'medications','listAll')).length,0);
 const med=medications[0].id;
 await repo(b,'medications','updateSchedule',[med,{schedule:'bedtime'}],502);
 await repo(b,'medicationIntakes','setTaken',[med,date,true],502);
 await repo(a,'medications','updateSchedule',[med,{schedule:'bedtime',scheduledTime:'21:30'}]);
 const saved=await repo(a,'medications','getByIds',[[med]]);assert.equal(saved[0].scheduledTime,'21:30');
 await repo(a,'medicationIntakes','setTaken',[med,date,true]);
 await repo(a,'medicationIntakes','setTaken',[med,date,true]);
 assert.equal((await repo(a,'medicationIntakes','listByDate',[date])).length,1);
 assert.equal((await repo(b,'medicationIntakes','listByDate',[date])).length,0);
 await repo(a,'medicationIntakes','updateRecordedAt',[med,date,'2026-09-15T10:30:00.000Z']);
 assert.equal(Date.parse((await repo(a,'medicationIntakes','listByDate',[date]))[0].recordedAt),Date.parse('2026-09-15T10:30:00Z'));
 await repo(a,'medicationIntakes','setTaken',[med,date,false]);assert.equal((await repo(a,'medicationIntakes','listByDate',[date])).length,0);
 await repo(a,'medications','deactivate',[med]);assert.equal((await repo(a,'medications','listActive')).length,2);mark('Medication schedules, edit/deactivate, intake/undo/time, owner isolation');
 await repo(a,'visitSchedules','saveUpcoming',['2026-12-10']);await repo(a,'visitSchedules','saveUpcoming',['2026-12-11']);
 assert.equal((await repo(a,'visitSchedules','getUpcoming')).visitDate,'2026-12-11');assert.equal(await repo(b,'visitSchedules','getUpcoming'),null);
 await repo(a,'visitSchedules','deleteUpcoming');assert.equal(await repo(a,'visitSchedules','getUpcoming'),null);mark('Visit upcoming create/edit/delete and isolation');
 const mood={date,mood:'good',moodLabel:'기분이 좋아요',recordedAt:now,memberSummary:'Dev QA synthetic record'};
 await repo(a,'moods','save',[mood]);await repo(a,'moods','save',[mood],409);
 assert.equal((await repo(a,'moods','findByDate',[date])).memberSummary,mood.memberSummary);assert.equal(await repo(b,'moods','findByDate',[date]),null);
 assert.equal((await repo(a,'moods','listRecent',['2026-09-01','2026-09-30'])).length,1);
 await repo(a,'moods','deleteByDate',[date]);assert.equal(await repo(a,'moods','findByDate',[date]),null);mark('Mood save/date/range/duplicate/delete and isolation');
 const db=await admin.from('user_medications').select('user_id,schedule').in('user_id',ids);
 assert.ifError(db.error);assert.equal(db.data.length,3);assert.ok(db.data.every(row=>row.user_id===ids[0]));mark('Dev database ownership cross-check');
 const changed=await clients[0].auth.updateUser({data:{addi_profile:'duck'}});assert.ifError(changed.error);
 const restored=await clients[0].auth.getUser();assert.ifError(restored.error);assert.equal(restored.data.user.id,ids[0]);assert.equal(restored.data.user.user_metadata.addi_profile,'duck');
 const refreshed=await clients[0].auth.refreshSession();assert.ifError(refreshed.error);assert.equal(refreshed.data.user.id,ids[0]);mark('Profile metadata, identity and real session refresh');
 if(process.env.ADDI_NATIVE_QA_MFDS === '1' || process.env.ADDI_NATIVE_QA_EXTERNAL === '1') {
  const found=await api(b,'medications/search?q='+encodeURIComponent('콘서타'));
  assert.ok(found.medications.length>0);mark('Live MFDS search');
 }
 if(process.env.ADDI_NATIVE_QA_EXTERNAL === '1') {
  const input={date,recordedAt:now,hasMedicationIntake:false,evidence:[
   {id:'focus:good',category:'concentration',label:'집중이 잘 되었어요'},
   {id:'relationship:none',category:'relationship',label:'특별한 문제는 없었어요'},
  ]};
  await api(b,'moods/analyze',{input:{}},'POST',400);
  const analysis=await api(b,'moods/analyze',{input});
  assert.ok(analysis.model && !analysis.model.includes('preview'));assert.ok(analysis.result.clinicPhrase.text);
  await repo(b,'moods','save',[{...mood,memberSummary:analysis.result.clinicPhrase.text.slice(0,300),clinicPhrase:analysis.result.clinicPhrase.text,analysisResult:analysis.result,analysisStatus:'completed',analysisModel:analysis.model,analysisVersion:analysis.version,analysisCreatedAt:analysis.createdAt}]);
  assert.equal((await repo(b,'moods','findByDate',[date])).analysisModel,analysis.model);mark('Real AI analysis and persisted result');
 }
 // Delete only the synthetic account created above, through the same Native endpoint.
 await repo(a,'moods','save',[mood]);await repo(a,'visitSchedules','saveUpcoming',['2026-12-12']);await repo(a,'medicationIntakes','setTaken',[medications[1].id,date,true]);
 await api(a,'account',undefined,'DELETE');
 const deleted=await admin.auth.admin.getUserById(ids[0]);assert.ok(deleted.error);
 for(const table of ['user_medications','medication_intake_records','mood_records','visit_schedules']) { const remaining=await admin.from(table).select('*',{count:'exact',head:true}).eq('user_id',ids[0]);assert.ifError(remaining.error);assert.equal(remaining.count,0); }
 await api(a,'repository',{repository:'medications',method:'listAll',args:[]},'POST',401);mark('Native account deletion, cascading data removal, stale session rejected');
 console.log(JSON.stringify({passed:checks.length,productionChanges:0,fcmSends:0,syntheticUsersOnly:true}));
} catch (error) {
 console.error('FAIL Dev integration:',error instanceof assert.AssertionError ? (String(error.message).startsWith('HTTP ') ? error.message : 'assertion after '+checks.length+' groups') : 'request failed');process.exitCode=1;
} finally {
 for(const id of ids) await admin.auth.admin.deleteUser(id,false);
 console.log('Disposable Dev accounts cleaned; no identifiers or record contents printed.');
}
