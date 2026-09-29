import { CapacitorHttp } from '@capacitor/core';
import { buildAnalyticsPayload, type AnalyticsEventName, type AnalyticsAuthState, type AnalyticsEventProperties } from '../../../../lib/analytics/schema';
import { isAnalyticsPathBlocked } from '../../../../lib/analytics/path-policy';
const PRODUCTION = import.meta.env.VITE_NATIVE_STAGE === 'production';
const TOKEN = (PRODUCTION
  ? import.meta.env.VITE_NATIVE_PRODUCTION_MIXPANEL_TOKEN
  : import.meta.env.VITE_NATIVE_MIXPANEL_TOKEN)?.trim();
const ENDPOINT = 'https://api.mixpanel.com/track?ip=0&verbose=1';
let opened = false;
let identity = '';
function distinctId() {
  if (identity) return identity;
  try { identity = localStorage.getItem('addi:native-analytics-id') ?? ''; } catch { /* memory fallback */ }
  if (!identity) {
    identity = crypto.randomUUID();
    try { localStorage.setItem('addi:native-analytics-id',identity); } catch { /* memory fallback */ }
  }
  return identity;
}
export const getAnalyticsEnvironment = () => PRODUCTION ? 'production' as const : 'development' as const;
export function trackAnalyticsEvent<T extends AnalyticsEventName>(eventName:T,authState:AnalyticsAuthState,properties:AnalyticsEventProperties<T>,pathnameOverride?:string):boolean {
  const pathname=pathnameOverride??location.pathname;
  if(!TOKEN||isAnalyticsPathBlocked(location.pathname)||isAnalyticsPathBlocked(pathname)) return false;
  const payload=buildAnalyticsPayload({eventName,authState,properties,pathname,environment:getAnalyticsEnvironment()});
  if(!payload) return false;
  // Exactly one send attempt, matching Web. Never replay on resume or mirror to Web.
  void CapacitorHttp.post({url:ENDPOINT,headers:{'Content-Type':'application/json'},
    data:[{event:eventName,properties:{...payload,token:TOKEN,distinct_id:distinctId(),$insert_id:crypto.randomUUID(),time:Math.floor(Date.now()/1000)}}],
    connectTimeout:5000,readTimeout:5000,
  }).catch(()=>undefined);
  return true;
}
export function trackAppOpened() {
  if(opened) return false;
  const tracked=trackAnalyticsEvent('app_opened','unknown',{});
  if(tracked) opened=true;
  return tracked;
}
export function resetAnalyticsIdentity() {
  identity='';
  try { localStorage.removeItem('addi:native-analytics-id'); } catch { /* no user data */ }
  return true;
}
