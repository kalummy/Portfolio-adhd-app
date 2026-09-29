import type { UserIdentity } from '@supabase/supabase-js';
import { Browser } from '@capacitor/browser';
import { getNativeClient, nativeConfig } from './client';
import { NativeAuthFlow, AuthFlowError, ATTEMPT_KEY, type Provider, type SecureStore } from './flow';
import { secureStorage, clearVerifiers } from './storage';
import { router } from '../platform/router';
const LINK_KEY = 'addi-native-link-attempt';
const OWNER_KEY = 'addi-native-link-owner';
const store: SecureStore = {
  getItem: key => secureStorage.getItem(key === ATTEMPT_KEY ? LINK_KEY : key),
  setItem: (key,value) => secureStorage.setItem(key === ATTEMPT_KEY ? LINK_KEY : key,value),
  removeItem: key => secureStorage.removeItem(key === ATTEMPT_KEY ? LINK_KEY : key),
};
let flow: NativeAuthFlow | undefined;
function identityFlow() {
  if (!nativeConfig) throw new Error('native_auth_not_configured');
  return flow ??= new NativeAuthFlow({
    store, callback:nativeConfig.callback, now:Date.now,
    random:()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join(''),
    clearVerifier:clearVerifiers,
    authorize:async(provider,redirectTo)=>{
      const {data,error}=await getNativeClient().auth.linkIdentity({provider,options:{redirectTo,skipBrowserRedirect:true}});
      if(error||!data.url||!data.flowId) throw new Error('identity_link_failed');
      const url=new URL(data.url);
      // Provider redirects are returned by authenticated Supabase linkIdentity, never user input.
      if(url.protocol!=='https:'||url.username||url.password) throw new Error('invalid_identity_authorize');
      return {url:data.url,flowId:data.flowId};
    },
    open:async url=>{await Browser.open({url});},
    exchange:async(code,flowId)=>{
      const client=getNativeClient();
      const owner=await secureStorage.getItem(OWNER_KEY);
      const before=await client.auth.getSession();
      if(!owner||before.error||before.data.session?.user.id!==owner) throw new Error('account_changed');
      const {data,error}=await client.auth.exchangeCodeForSession(code,{flowId});
      if(error||data.user?.id!==owner) {
        // A linking callback must never switch the signed-in account.
        await client.auth.setSession(before.data.session);
        throw new Error('identity_link_failed');
      }
      const verified=await client.auth.getUser();
      if(verified.error||verified.data.user.id!==owner) throw new Error('identity_link_failed');
      router.replace('/my/social-login?linked=' + Date.now());
    },
  });
}
export async function getLinkedOAuthIdentities() {
  const {data,error}=await getNativeClient().auth.getUserIdentities();
  if(error) throw error;
  return data.identities.filter((identity): identity is UserIdentity & { provider: Provider } => identity.provider==='google'||identity.provider==='kakao');
}
export async function linkOAuthIdentity(provider:Provider) {
  // An explicit new tap supersedes a cancelled Custom Tab attempt. Old callbacks
  // keep their old nonce and cannot complete this replacement attempt.
  if (await secureStorage.getItem(LINK_KEY)) await cancelIdentityLink();
  const {data,error}=await getNativeClient().auth.getUser();
  if(error||!data.user) throw new Error('authentication_required');
  await secureStorage.setItem(OWNER_KEY,data.user.id);
  try { await identityFlow().start(provider); }
  catch (error) { await secureStorage.removeItem(OWNER_KEY); throw error; }
}
export async function refreshIdentityLinkScreen() {
  if (location.pathname === '/my/social-login' && await secureStorage.getItem(LINK_KEY))
    router.replace('/my/social-login?pending=' + Date.now());
}
export async function unlinkOAuthIdentity(provider:Provider) {
  const identities=await getLinkedOAuthIdentities();
  if(identities.length<=1) throw new Error('last_identity');
  const identity=identities.find(row=>row.provider===provider);
  if(!identity) throw new Error('identity_not_found');
  const {error}=await getNativeClient().auth.unlinkIdentity(identity);
  if(error) throw error;
}
export async function handleIdentityCallback(raw:string) {
  if(!await secureStorage.getItem(LINK_KEY)) return false;
  try { await identityFlow().callback(raw); }
  catch(error) {
    if(error instanceof AuthFlowError&&error.reason==='invalid_callback') return false;
    router.replace('/my/social-login?linkError=' + Date.now());
  }
  await Browser.close().catch(()=>undefined);
  await secureStorage.removeItem(OWNER_KEY);
  return true;
}
export async function cancelIdentityLink() {
  // Also drain an exchange whose nonce has already been consumed before logout.
  if(flow || await secureStorage.getItem(LINK_KEY)) await identityFlow().cancel();
  await secureStorage.removeItem(OWNER_KEY);
}
