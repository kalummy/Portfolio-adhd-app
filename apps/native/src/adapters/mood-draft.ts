import { readMoodDraft as readSharedDraft, writeMoodDraft as writeSharedDraft, clearMoodDraft as clearSharedDraft } from '../../../../lib/mood-draft';
import { getNativeAuthSnapshot, subscribeNativeAuth } from '../auth/runtime';
export type { MoodDraftPhase } from '../../../../lib/mood-draft';
const data=new Map<string,string>();
const memory:Storage={get length(){return data.size;},clear:()=>data.clear(),getItem:key=>data.get(key)??null,key:index=>[...data.keys()][index]??null,removeItem:key=>{data.delete(key);},setItem:(key,value)=>{data.set(key,value);}};
let owner='';subscribeNativeAuth(()=>{const next=getNativeAuthSnapshot().user?.id??'';if(next!==owner){data.clear();owner=next;}});
export function readMoodDraft(_storage: Storage, date: string) { return readSharedDraft(memory, date); }
export function writeMoodDraft(_storage: Storage, date: string, draft: Parameters<typeof writeSharedDraft>[2]) { return writeSharedDraft(memory, date, draft); }
export function clearMoodDraft(_storage: Storage, date: string) { return clearSharedDraft(memory, date); }
