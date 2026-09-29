import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../supabase/functions/native-push/index.js', import.meta.url), 'utf8');
const functionSource = source.slice(
  source.indexOf('async function sendClaimedReminder(req) {'),
  source.indexOf('\nDeno.serve(async (req) => {'),
);
assert.ok(functionSource.startsWith('async function sendClaimedReminder'));
const id = '11111111-1111-4111-8111-111111111111';
const target = '22222222-2222-4222-8222-222222222222';
const claim = '33333333-3333-4333-8333-333333333333';
const body = { userId:id, date:'2026-09-28', slot:'mood_1500', claimToken:claim, targetId:target, kind:'mood' };
function fixture(overrides={}) {
  const reads=[];const sends=[];
  const rows={
    reminder_dispatches:{delivery_kind:'mood',status:'processing',claim_token:claim,window_expires_at:'2099-01-01T00:00:00Z'},
    reminder_deliveries:{status:'processing',claim_token:claim,binding_id:id,token_hash:'synthetic-hash'},
    native_push_registrations:{installation_id:id,binding_id:id,fcm_token:'synthetic-token',token_hash:'synthetic-hash'},
    ...overrides,
  };
  const db={from(table){reads.push(table);const query={select(){return query},eq(){return query},is(){return query},maybeSingle:async()=>({data:rows[table],error:null})};return query}};
  const send=async(...args)=>{sends.push(args);return {status:'sent',http:null,code:null}};
  const handler=new Function('Deno','db','send','UUID','Response',`${functionSource}; return sendClaimedReminder`)(
    {env:{get:()=> 'synthetic-service-key'}},db,send,/^[a-f0-9-]{36}$/i,Response);
  const request=(payload=body,key='synthetic-service-key')=>new Request('https://dev.example/scheduler-send',{
    method:'POST',headers:{authorization:`Bearer ${key}`},body:JSON.stringify(payload),
  });
  return {handler,request,reads,sends};
}

test('Edge provider requires service role and rejects arbitrary targets',async()=>{
  const f=fixture();
  assert.equal((await f.handler(f.request(body,'wrong'))).status,403);
  assert.equal((await f.handler(f.request({...body,targetId:'invalid'}))).status,400);
  assert.deepEqual(f.reads,[]);
  assert.equal(f.sends.length,0);
});

test('Edge provider sends only current frozen FCM delivery',async()=>{
  const f=fixture();
  const response=await f.handler(f.request());
  assert.equal(response.status,200);
  assert.equal((await response.json()).status,'sent');
  assert.deepEqual(f.reads,['reminder_dispatches','reminder_deliveries','native_push_registrations']);
  assert.equal(f.sends.length,1);
  assert.equal(f.sends[0][2],`2026-09-28:mood_1500:${target}`);
  for(const changed of [
    {reminder_dispatches:{delivery_kind:'mood',status:'sent',claim_token:claim,window_expires_at:'2099-01-01T00:00:00Z'}},
    {reminder_deliveries:{status:'sent',claim_token:claim,binding_id:id,token_hash:'synthetic-hash'}},
    {native_push_registrations:{installation_id:id,binding_id:id,fcm_token:'synthetic-token',token_hash:'changed'}},
  ]){
    const invalid=fixture(changed);
    assert.equal((await invalid.handler(invalid.request())).status,409);
    assert.equal(invalid.sends.length,0);
  }
});
