import test from 'node:test';
import assert from 'node:assert/strict';
import { ResourceCache } from '../src/api/resource-cache.ts';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
test('two resume events expire old values but share the new in-flight refresh', async () => {
 const cache=new ResourceCache();await cache.read('med','all',async()=>['old']);
 cache.expire();const fresh=deferred();const a=cache.read('med','all',()=>fresh.promise);
 cache.expire();const b=cache.read('med','all',async()=>{throw Error('duplicate');});
 fresh.resolve(['fresh']);assert.deepEqual(await Promise.all([a,b]),[['fresh'],['fresh']]);
});
test('duplicate consumers share one request; TTL and focus clear revalidate', async () => {
 let now=0,calls=0;const cache=new ResourceCache(30,()=>now);cache.setScope('a');
 const fetch=async()=>{calls++;return ['record'];};
 assert.deepEqual(await Promise.all([cache.read('med','all',fetch),cache.read('med','all',fetch)]),[['record'],['record']]);assert.equal(calls,1);
 await cache.read('med','all',fetch);assert.equal(calls,1);now=31;await cache.read('med','all',fetch);assert.equal(calls,2);
 cache.clear();await cache.read('med','all',fetch);assert.equal(calls,3);
});
test('mutations invalidate only their resource and cannot reuse pre-write reads', async () => {
 const cache=new ResourceCache();cache.setScope('a');const stale=deferred();
 const request=cache.read('med','all',()=>stale.promise);const rejected=assert.rejects(request,/cache_invalidated/);
 await cache.read('mood','all',async()=>['unchanged']);cache.invalidate('med');
 await cache.read('med','all',async()=>['updated']);stale.resolve(['old']);await rejected;
 assert.deepEqual(cache.peek('med','all'),['updated']);assert.deepEqual(cache.peek('mood','all'),['unchanged']);
});
test('logout and account switch discard cached and pending data, including same-user relogin',async()=>{
 const cache=new ResourceCache();cache.setScope('a');const stale=deferred();
 const request=cache.read('med','all',()=>stale.promise);const rejected=assert.rejects(request,/cache_invalidated/);
 cache.setScope('');cache.setScope('a');stale.resolve(['private']);await rejected;assert.equal(cache.peek('med','all'),undefined);
 await cache.read('med','all',async()=>['a']);cache.setScope('b');assert.equal(cache.peek('med','all'),undefined);
});
test('failed reads are retryable; ambiguous mutation invalidation cannot keep old success',async()=>{
 const cache=new ResourceCache();let calls=0;
 await assert.rejects(cache.read('visit','upcoming',async()=>{calls++;throw Error('offline');}),/offline/);
 assert.equal(await cache.read('visit','upcoming',async()=>{calls++;return null;}),null);assert.equal(calls,2);
 cache.invalidate('visit');assert.equal(cache.peek('visit','upcoming'),undefined);
});
test('bounded image cache does not retain oversized blobs, and shares pending downloads',async()=>{
 const cache=new ResourceCache(30,()=>0,2);const retain=x=>x.size<=512*1024;let calls=0;
 const big=()=>{calls++;return Promise.resolve(new Blob([new Uint8Array(512*1024+1)]));};
 await Promise.all([cache.read('img','big',big,retain),cache.read('img','big',big,retain)]);assert.equal(calls,1);
 await cache.read('img','big',big,retain);assert.equal(calls,2);
 for(const k of ['one','two','three'])await cache.read('img',k,async()=>k);
 assert.equal(cache.peek('img','one'),undefined);assert.equal(cache.peek('img','three'),'three');
});
