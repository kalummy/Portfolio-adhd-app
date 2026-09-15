import { createClient } from '@supabase/supabase-js';
import { createNativeApiHandler } from '@/lib/native-api/server';
import { NATIVE_API_ORIGIN } from '@/lib/native-api/contracts';

export const maxDuration = 60;

export async function POST(request: Request) {
  // The existing Web route and Production credential remain completely independent.
  if (process.env.VERCEL_ENV !== 'preview' || process.env.NEXT_PUBLIC_SUPABASE_URL !== NATIVE_API_ORIGIN) {
    return Response.json({code:'ENVIRONMENT_DISABLED'}, {status:503,headers:{'Cache-Control':'no-store'}});
  }
  const requestIdHeader=request.headers.get('x-addi-ai-request-id');
  const requestId=requestIdHeader && /^[a-f0-9-]{36}$/.test(requestIdHeader) ? requestIdHeader : crypto.randomUUID();
  const handler=createNativeApiHandler({
    supabaseUrl:NATIVE_API_ORIGIN,
    authenticate:async token => {
      const client=createClient(NATIVE_API_ORIGIN,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',{
        auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}},
      });
      const {data,error}=await client.auth.getUser(token);
      return {client,user:error?null:data.user};
    },
    admin:()=>{throw new Error('AI route does not permit admin operations');},
    openaiKey:process.env.OPENAI_API_KEY,
    openaiModel:process.env.OPENAI_MOOD_MODEL,
    auditAnalysis:stage=>console.info('native_ai_preview',JSON.stringify({requestId,stage})),
  });
  const url=new URL(request.url);url.pathname='/native-api/moods/analyze';
  const response=await handler(new Request(url,new Request(request)));
  response.headers.set('x-addi-ai-request-id',requestId);
  return response;
}
