import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { createNativeApiHandler, requestPreviewMoodAnalysis } from './bundle.js';
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const options = { auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false} };
Deno.serve(async request => {
const requestId = crypto.randomUUID();
const previewBypass = Deno.env.get('ADDI_DEV_AI_PREVIEW_BYPASS');
const handler = createNativeApiHandler({
  supabaseUrl,
  authenticate: async token => {
    const client = createClient(supabaseUrl,Deno.env.get('SUPABASE_ANON_KEY'),{
      ...options,global:{headers:{Authorization:`Bearer ${token}`}},
    });
    const {data,error} = await client.auth.getUser(token);
    return {client,user:error ? null : data.user};
  },
  admin: () => createClient(supabaseUrl,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),options),
  analyzeMood: previewBypass ? (input, token) => requestPreviewMoodAnalysis(input,token,previewBypass,requestId) : undefined,
  auditAnalysis: stage => console.info('native_ai_edge',JSON.stringify({requestId,stage})),
  openaiKey:Deno.env.get('ADDI_DEV_OPENAI_API_KEY'),
  openaiModel:Deno.env.get('ADDI_DEV_OPENAI_MOOD_MODEL'),
});
const response = await handler(request);
if (new URL(request.url).pathname.endsWith('/moods/analyze')) response.headers.set('x-addi-ai-request-id',requestId);
return response;
});
