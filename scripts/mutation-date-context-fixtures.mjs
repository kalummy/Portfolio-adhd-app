import assert from 'node:assert/strict';
import {readDateContext,withDateContext,dateContextHref} from '../lib/date-context.ts';
import {getKstDateKey} from '../lib/kst-date.ts';
import {dateContextHref as registrationDateContextHref} from '../lib/registration-session.ts';
assert.equal(registrationDateContextHref,dateContextHref,'registration and visits share one helper');
for(const [instant,date] of [
 ['2026-09-15T14:59:00Z','2026-09-15'],
 ['2026-09-15T15:01:00Z','2026-09-16'],
 ['2026-09-16T14:59:00Z','2026-09-16'],
 ['2026-09-16T15:01:00Z','2026-09-17'],
]) assert.equal(getKstDateKey(new Date(instant)),date);
for(const date of ['2026-09-15','2026-09-16','2026-09-20']){
 globalThis.window={location:{search:'?date='+date},get sessionStorage(){throw Error('must not use stale storage');},get localStorage(){throw Error('must not use stale storage');}};
 for(const path of ['/','/medications','/visits','/visits/edit','/?visitToast=deleted','/?medicationToast=time-updated','/visits?visitToast=updated#card']){
  const href=dateContextHref(path);assert.equal(readDateContext(new URL(href,'https://addi.invalid').search),date);
  assert.equal(withDateContext(href,date),href,'idempotent across repeated mutations');
 }
 assert.equal(dateContextHref('/?visitToast=deleted#home'),`/?visitToast=deleted&date=${date}#home`);
}
for(const date of ['2026-02-29','2026-09-00','2026-13-01','2026-09-16T00:00:00+09:00','not-a-date'])assert.equal(readDateContext('?date='+encodeURIComponent(date)),undefined);
assert.equal(readDateContext('?date=2026-09-16&date=2026-09-15'),'2026-09-16');
delete globalThis.window;
assert.equal(dateContextHref('/'),'/', 'server-safe');
console.log('PASS shared date context, past/today/future, KST 23:59/00:01, invalid dates, unavailable storage; TZ='+process.env.TZ);
