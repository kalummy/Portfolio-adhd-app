import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MoodDraftVault} from '../src/api/mood-draft-vault.ts';
const setup=()=>{const disk=new Map();return {disk,store:{getItem:async k=>disk.get(k)??null,setItem:async(k,v)=>disk.set(k,v),removeItem:async k=>disk.delete(k)}};};
test('draft survives new document/process and is isolated per owner',async()=>{
 const {disk,store}=setup();const a=new MoodDraftVault(store);await a.restore('owner-a');
 const storage=a.storage('owner-a');storage.setItem('addi:mood-draft:2026-09-17','{"answers":["synthetic"]}');await a.flush();
 const b=new MoodDraftVault(store);await b.restore('owner-a');assert.equal(b.storage('owner-a').getItem('addi:mood-draft:2026-09-17'),'{"answers":["synthetic"]}');
 await b.restore('owner-b');assert.equal(b.storage('owner-b').length,0);assert.equal(b.storage('owner-a').length,0);
 storage.setItem('addi:mood-draft:2026-09-18','x');await a.lock();storage.setItem('addi:mood-draft:2026-09-19','late');assert.doesNotMatch(disk.get('addi-native-mood-drafts-owner-a'),/late/);
});
test('save/cancel deletion is durable, queued writes cannot resurrect it',async()=>{
 const {store,disk}=setup();const a=new MoodDraftVault(store);await a.restore('a');const s=a.storage('a');
 s.setItem('addi:mood-draft:2026-09-17','one');s.setItem('addi:mood-draft:2026-09-17','two');s.removeItem('addi:mood-draft:2026-09-17');await a.flush();assert.equal(disk.size,0);
 const restart=new MoodDraftVault(store);await restart.restore('a');assert.equal(restart.storage('a').length,0);
});
test('late completion from an old account/session cannot write into a new vault',async()=>{
 const {store,disk}=setup(),v=new MoodDraftVault(store);await v.restore('a');const old=v.storage('a');await v.lock();await v.restore('b');old.setItem('addi:mood-draft:2026-09-17','late-a');await v.flush();assert.equal(disk.size,0);await v.restore('a');old.setItem('addi:mood-draft:2026-09-17','late-old-session');await v.flush();assert.equal(disk.size,0);
});
