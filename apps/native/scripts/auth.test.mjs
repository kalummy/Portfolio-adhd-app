import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NativeAuthFlow, ATTEMPT_KEY, ATTEMPT_TTL, callbackCode } from '../src/auth/flow.ts';
import { validateCallbackBase, readNativeConfig, DEV_SUPABASE_URL } from '../src/auth/config.ts';
const callback = 'https://addi-auth-qa.example.com/auth/native/callback';
function setup() {
  const memory = new Map(); let now = 1_000_000, exchanges = 0, clears = 0, opened;
  const store = { getItem: async k => memory.get(k) ?? null, setItem: async (k,v) => { memory.set(k,v); }, removeItem: async k => { memory.delete(k); } };
  const deps = { store, callback, now: () => now, random: () => 'a'.repeat(64),
    authorize: async () => ({ url: 'https://example.com/authorize', flowId: 'b'.repeat(32) }),
    open: async url => { opened = url; }, clearVerifier: async () => { clears++; },
    exchange: async () => { assert.equal(await store.getItem(ATTEMPT_KEY), null); exchanges++; } };
  const flow = new NativeAuthFlow(deps);
  return { flow, deps, memory, setNow: n => { now = n; }, exchanges: () => exchanges, url: (query='') => `${callback}?attempt=${'a'.repeat(64)}&code=synthetic${query}` };
}
for (const provider of ['google', 'kakao']) {
  test(`${provider}: start -> secure attempt -> exchange once`, async () => {
    const s=setup(); await s.flow.start(provider); assert.equal((await s.flow.pending()).provider,provider);
    await s.flow.callback(s.url()); assert.equal(s.exchanges(),1);
    await assert.rejects(s.flow.callback(s.url()), { reason:'no_attempt' });
  });
}
test('concurrent duplicate callback exchanges exactly once', async()=>{
  const s=setup(); await s.flow.start('google'); const results=await Promise.allSettled([s.flow.callback(s.url()),s.flow.callback(s.url())]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1); assert.equal(s.exchanges(),1);
});
test('cold process restart retrieves original flow ID and verifier slot', async()=>{
  const s=setup(); await s.flow.start('kakao'); const restarted=new NativeAuthFlow(s.deps); await restarted.callback(s.url()); assert.equal(s.exchanges(),1);
});
test('overlapping login attempt cannot replace verifier', async()=>{
  const s=setup(); await s.flow.start('google'); await assert.rejects(s.flow.start('kakao'),{ reason:'busy' }); assert.equal((await s.flow.pending()).provider,'google');
});
for (const change of [
  u=>u.replace('https:','http:'), u=>u.replace('addi-auth-qa.example.com','attacker.example.com'),
  u=>u.replace('/auth/native/callback','/auth/callback'), u=>u+'#access_token=synthetic',
  u=>u+'&code=duplicate', u=>u+'&attempt=duplicate', u=>u.replace('attempt=aaa','attempt=bbb'),
  u=>u+'&access_token=synthetic', u=>u.replace('https://','https://name:password@'),
  u=>u.replace('code=synthetic','code='), u=>u+'&next=https://attacker.example.com',
]) test(`reject malformed callback ${String(change)}`,async()=>{
  const s=setup(); await s.flow.start('google'); await assert.rejects(s.flow.callback(change(s.url())),{reason:'invalid_callback'});
  assert.ok(await s.flow.pending()); assert.equal(s.exchanges(),0);
});
test('expired callback clears pending state and cannot exchange',async()=>{
  const s=setup(); await s.flow.start('google'); s.setNow(1_000_000+ATTEMPT_TTL);
  await assert.rejects(s.flow.callback(s.url()),{reason:'expired'}); assert.equal(await s.flow.pending(),null);
});
test('clock rollback fails closed',async()=>{
  const s=setup(); await s.flow.start('google'); s.setNow(0); await assert.rejects(s.flow.callback(s.url()),{reason:'expired'});
});
test('explicit browser cancellation deletes attempt; callback after cancel rejected',async()=>{
  const s=setup(); await s.flow.start('google'); await s.flow.cancel(); await assert.rejects(s.flow.callback(s.url()),{reason:'no_attempt'});
});
test('provider cancellation clears only matched attempt',async()=>{
  const s=setup(); await s.flow.start('kakao'); await assert.rejects(s.flow.callback(s.url().replace('code=synthetic','error=access_denied')),{reason:'cancelled'}); assert.equal(await s.flow.pending(),null);
});
test('exchange/network failure is terminal; no retry with a consumed code',async()=>{
  const s=setup(); s.deps.exchange=async()=>{throw new Error('offline')}; await s.flow.start('google');
  await assert.rejects(s.flow.callback(s.url())); await assert.rejects(s.flow.callback(s.url()),{reason:'no_attempt'});
});
test('secure storage failure never opens browser',async()=>{
  const s=setup(); let opens=0; s.deps.open=async()=>{opens++}; s.deps.store.setItem=async()=>{throw new Error('locked')};
  await assert.rejects(s.flow.start('google')); assert.equal(opens,0);
});
test('Production target and callback are rejected by build config',()=>{
  assert.throws(()=>validateCallbackBase('https://addi-gamma.vercel.app/auth/native/callback'));
  assert.throws(()=>readNativeConfig({VITE_NATIVE_SUPABASE_URL:'https://production.supabase.co',VITE_NATIVE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',VITE_NATIVE_AUTH_CALLBACK:callback}));
  assert.equal(readNativeConfig({}),null);
});
test('real Supabase SDK: S256 verifier generated here, persisted, flow-matched exchange and refresh',async()=>{
  const memory=new Map(); const requests=[];
  const storage={getItem:async k=>memory.get(k)??null,setItem:async(k,v)=>{memory.set(k,v)},removeItem:async k=>{memory.delete(k)}};
  const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',app_metadata:{provider:'google'},user_metadata:{},created_at:'2026-01-01T00:00:00Z',identities:[{provider:'google',identity_id:'same-provider-id',user_id:'11111111-1111-4111-8111-111111111111'}]};
  let tokenCounter=0;
  const sdk=createClient(DEV_SUPABASE_URL,'sb_publishable_fixture',{auth:{storage,storageKey:'addi-native-test',flowType:'pkce',persistSession:true,detectSessionInUrl:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
    const url=new URL(String(input)); const body=init?.body?JSON.parse(init.body):null; requests.push({url,body});
    if(url.pathname.endsWith('/logout')) return new Response('{}',{status:200});
    if(url.pathname.endsWith('/user')) return Response.json(user);
    tokenCounter++; return Response.json({access_token:`synthetic-access-${tokenCounter}`,refresh_token:`synthetic-refresh-${tokenCounter}`,expires_in:3600,token_type:'bearer',user});
  }}});
  const {data,error}=await sdk.auth.signInWithOAuth({provider:'google',options:{redirectTo:callback,skipBrowserRedirect:true}}); assert.equal(error,null);
  const url=new URL(data.url),flowId=data.flowId;
  const verifier=JSON.parse(memory.get(`addi-native-test-flow-${flowId}-code-verifier`));
  assert.ok(verifier.length>=43); assert.equal(url.searchParams.get('code_challenge_method'),'s256');
  assert.equal(url.searchParams.get('code_challenge'),createHash('sha256').update(verifier).digest('base64url'));
  const exchanged=await sdk.auth.exchangeCodeForSession('synthetic-code',{flowId}); assert.equal(exchanged.error,null); assert.equal(exchanged.data.user.id,user.id);
  assert.equal(requests[0].body.code_verifier,verifier); assert.equal(requests[0].body.auth_code,'synthetic-code');
  const refreshed=await sdk.auth.refreshSession(); assert.equal(refreshed.error,null); assert.equal(refreshed.data.user.id,user.id);
  assert.equal(refreshed.data.session.refresh_token,'synthetic-refresh-2');
  assert.equal((await sdk.auth.getSession()).data.session.user.id,user.id);
  await sdk.auth.signOut({scope:'local'}); assert.equal(memory.has('addi-native-test'),false);
});
