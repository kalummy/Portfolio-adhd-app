import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { createNativeApiHandler } from './bundle.js';
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const options = { auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false} };
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
  openaiKey:Deno.env.get('ADDI_DEV_OPENAI_API_KEY'),
  openaiModel:Deno.env.get('ADDI_DEV_OPENAI_MOOD_MODEL'),
});
Deno.serve(handler);
