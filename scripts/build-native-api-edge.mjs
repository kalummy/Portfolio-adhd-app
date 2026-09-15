import { build } from '../apps/native/node_modules/esbuild/lib/main.js';
await build({
  entryPoints:['lib/native-api/server.ts'],bundle:true,platform:'neutral',format:'esm',target:'es2022',
  outfile:'supabase/functions/native-api/bundle.js',
  define:{'process.env.MFDS_SERVICE_KEY':'ADDI_MFDS_KEY','process.env.MFDS_PILL_IDENTIFICATION_SERVICE_KEY':'ADDI_MFDS_PILL_KEY'},
  banner:{js:'const ADDI_MFDS_KEY = globalThis.Deno?.env.get("ADDI_DEV_MFDS_SERVICE_KEY"); const ADDI_MFDS_PILL_KEY = globalThis.Deno?.env.get("ADDI_DEV_MFDS_PILL_IDENTIFICATION_SERVICE_KEY");'},
  plugins:[{name:'server-client-injection',setup(build){
    build.onResolve({filter:/^@\/lib\/supabase\/client$/},()=>({path:'injected-client',namespace:'native-api'}));
    build.onLoad({filter:/.*/,namespace:'native-api'},()=>({contents:'export function createBrowserSupabaseClient(){throw new Error("authenticated_client_required");}',loader:'js'}));
  }}],
});
console.log('Built Dev Native API; secrets resolved only in Edge runtime.');
