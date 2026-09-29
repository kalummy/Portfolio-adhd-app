import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { createNativeApiHandler, requestPreviewMoodAnalysis, nativeStage, assertNativeProject } from './bundle.js';
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const stage = 'production';
const expectedSupabaseUrl = assertNativeProject(stage, supabaseUrl);
const options = { auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false} };
Deno.serve(async request => {
const started = performance.now();
let authMs = 0;
let authCalls = 0;
const requestId = crypto.randomUUID();
const previewBypass = stage === 'development' ? Deno.env.get('ADDI_DEV_AI_PREVIEW_BYPASS') : undefined;
const handler = createNativeApiHandler({
  supabaseUrl,
  expectedSupabaseUrl,
  authenticate: async token => {
    const client = createClient(supabaseUrl,Deno.env.get('SUPABASE_ANON_KEY'),{
      ...options,global:{headers:{Authorization:`Bearer ${token}`}},
    });
    const authStarted = performance.now();
    authCalls++;
    const {data,error} = await client.auth.getUser(token);
    authMs += performance.now() - authStarted;
    return {client,user:error ? null : data.user};
  },
  admin: () => createClient(supabaseUrl,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),options),
  analyzeMood: previewBypass ? (input, token) => requestPreviewMoodAnalysis(input,token,previewBypass,requestId) : undefined,
  auditAnalysis: stage => console.info('native_ai_edge',JSON.stringify({requestId,stage})),
  openaiKey:Deno.env.get(stage === 'production' ? 'ADDI_PROD_OPENAI_API_KEY' : 'ADDI_DEV_OPENAI_API_KEY'),
  openaiModel:Deno.env.get(stage === 'production' ? 'ADDI_PROD_OPENAI_MOOD_MODEL' : 'ADDI_DEV_OPENAI_MOOD_MODEL'),
});
const response = await handler(request);
// Numeric Dev diagnostics only; authentication and response bodies are unchanged.
response.headers.set('Server-Timing', `auth;dur=${authMs.toFixed(1)}, edge;dur=${(performance.now() - started).toFixed(1)}, authcalls;dur=${authCalls}`);
if (new URL(request.url).pathname.endsWith('/moods/analyze')) response.headers.set('x-addi-ai-request-id',requestId);
return response;
});
