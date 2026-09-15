import assert from 'node:assert/strict';
import { build } from '../apps/native/node_modules/esbuild/lib/main.js';
const bundled=await build({entryPoints:['app/api/native/moods/analyze/route.ts'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'client-boundary',setup(b){b.onResolve({filter:/^@\/lib\/supabase\/client$/},()=>({path:'client',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export function createBrowserSupabaseClient(){throw Error("unexpected_browser_client");}',loader:'js'}));}}]});
const {POST}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const original={environment:process.env.VERCEL_ENV,url:process.env.NEXT_PUBLIC_SUPABASE_URL};
const request=origin=>new Request('https://preview.example/api/native/moods/analyze',{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:'{}'});
try {
 process.env.VERCEL_ENV='production';process.env.NEXT_PUBLIC_SUPABASE_URL='https://ohobxicxchkaisxxswkk.supabase.co';
 assert.equal((await POST(request())).status,503);
 process.env.VERCEL_ENV='preview';process.env.NEXT_PUBLIC_SUPABASE_URL='https://invalid.supabase.co';
 assert.equal((await POST(request())).status,503);
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://ohobxicxchkaisxxswkk.supabase.co';
 assert.equal((await POST(request())).status,401);
 assert.equal((await POST(request('https://evil.example'))).status,403);
 console.log('PASS Preview AI route rejects Production, wrong project, missing Bearer and wrong Origin');
} finally {
 for(const [key,value] of [['VERCEL_ENV',original.environment],['NEXT_PUBLIC_SUPABASE_URL',original.url]])if(value===undefined)delete process.env[key];else process.env[key]=value;
}
