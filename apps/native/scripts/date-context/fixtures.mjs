// Synthetic, in-memory repositories only. Never loaded by the application build.
export const user = {id:'11111111-1111-4111-8111-111111111111',user_metadata:{name:'Date QA'},app_metadata:{},aud:'authenticated'};
const auth = {status:'signed_in',user};
export const getNativeAuthSnapshot = () => auth;
export const subscribeNativeAuth = () => () => {};
export const requireNativeUser = async () => user;
export const getCurrentUser = async () => user;
export const getAuthState = async () => ({isAuthenticated:true,user});
export const signInNative = async () => {};
export const signOutNative = async () => {};
export const cancelNativeLogin = () => {};
export const handleNativeAuthCallback = async () => {};
export const hasUnreadNotifications = async () => false;
let medications, intakes, visit;
const qa = {fail:'',calls:[], reset(date='2026-09-16') {
 this.fail='';this.calls=[];
 medications=[{id:'date-qa-med',name:'날짜검증약',strengthValue:10,strengthUnit:'mg',imagePath:'/icons/medication-fallback-64.svg',registrationMethod:'manual',schedule:'daily',createdAt:'2026-09-01T00:00:00.000Z',active:true}];
 intakes=[{id:`${date}:date-qa-med`,medicationId:'date-qa-med',date,taken:true,recordedAt:`${date}T01:00:00.000Z`}];
 visit={id:'upcoming',visitDate:'2026-09-25',createdAt:'2026-09-01T00:00:00.000Z',updatedAt:'2026-09-01T00:00:00.000Z'};
}, snapshot:()=>({medications,intakes,visit})};
qa.reset();
if(typeof window!=='undefined') window.__DATE_QA__=qa;
function mutation(name) {qa.calls.push(name);if(qa.fail===name) throw Error('synthetic_failure');}
const repositories={
 medications:{listAll:async()=>medications,listActive:async()=>medications.filter(m=>m.active),getByIds:async(ids)=>medications.filter(m=>ids.includes(m.id)),deactivate:async(id)=>{mutation('medication-delete');medications=medications.map(m=>m.id===id?{...m,active:false}:m);return medications.find(m=>m.id===id);}},
 medicationIntakes:{listAll:async()=>intakes,listByDate:async(date)=>intakes.filter(i=>i.date===date),hasHistory:async(id)=>intakes.some(i=>i.medicationId===id),updateRecordedAt:async(id,date,time)=>{mutation('intake-edit');const item=intakes.find(i=>i.medicationId===id&&i.date===date);item.recordedAt=time;return item;},setTaken:async(id,date,taken)=>{mutation('intake-cancel');intakes=intakes.filter(i=>i.medicationId!==id||i.date!==date);return null;}},
 moods:{listAll:async()=>[]},
 visitSchedules:{getUpcoming:async()=>visit,saveUpcoming:async(date)=>{mutation('visit-edit');visit={...visit,visitDate:date};return visit;},deleteUpcoming:async()=>{mutation('visit-delete');visit=null;}}
};
export const getDataRepositories=async()=>repositories;
export const getVisitScheduleRepository=async()=>repositories.visitSchedules;
export const getMedicationRepository=async()=>repositories.medications;
export const getMedicationIntakeRepository=async()=>repositories.medicationIntakes;
export const getMoodRepository=async()=>repositories.moods;
export const runGuestDatasetSyncInBackground=async()=>({status:'no-local-data'});
export const clearDeletedAccountSession=async()=>{};
export const signOut=async()=>{};
export const updateAddiProfile=async()=>user;
export const listRecentNotifications=async()=>[];
export const markAllRecentNotificationsRead=async()=>{};
export const markNotificationRead=async()=>{};
export const enrichOfficialMedication=async(value)=>value;
export const enrichOfficialMedications=async(value)=>value;

export const getLinkedOAuthIdentities=async()=>[];
export const linkOAuthIdentity=async()=>{};
export const unlinkOAuthIdentity=async()=>{};
export const signInWithGoogle=async()=>{};
export const signInWithKakao=async()=>{};
