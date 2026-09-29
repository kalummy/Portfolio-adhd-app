import { mkdir, writeFile } from 'node:fs/promises';
import { loadEnv } from 'vite';
const env = { ...loadEnv('production', process.cwd(), 'VITE_NATIVE_'), ...process.env };
const stage = process.env.ADDI_NATIVE_STAGE ?? env.VITE_NATIVE_STAGE ?? 'development';
if (!['development','production'].includes(stage)) throw new Error('Invalid Native stage');
if (stage === 'production' && (process.env.ADDI_NATIVE_STAGE !== 'production' || env.VITE_NATIVE_STAGE !== 'production'))
  throw new Error('Production build and Vite stages required');
const value = env.VITE_NATIVE_AUTH_CALLBACK;
let host = 'native-auth-disabled.invalid';
if (value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash
    || url.pathname !== '/auth/native/callback'
    || url.hostname === 'localhost' || url.hostname.endsWith('.invalid')) throw new Error('Invalid Dev callback');
  if (stage === 'production' && url.href !== 'https://addi-gamma.vercel.app/auth/native/callback') throw new Error('Invalid Production callback');
  if (stage === 'development' && url.hostname === 'addi-gamma.vercel.app') throw new Error('Production callback in Dev');
  host = url.hostname;
}
if (stage === 'production' && (env.VITE_NATIVE_SUPABASE_URL !== 'https://joffvlsyxivveqycjrio.supabase.co' || host !== 'addi-gamma.vercel.app'))
  throw new Error('Production Native configuration incomplete');
if (stage === 'production' && !env.VITE_NATIVE_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_'))
  throw new Error('Production publishable key required');
const fingerprint = process.env.NATIVE_DEBUG_SHA256;
if (stage === 'production' && fingerprint) throw new Error('Dev fingerprint in Production');
await writeFile('android/native-auth.properties', `# Generated; no credentials.\nnativeStage=${stage}\nauthCallbackHost=${host}\n`);
if (stage === 'development' && fingerprint) {
  if (!/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(fingerprint)) throw new Error('Invalid debug fingerprint');
  await mkdir('dev-callback/.well-known', { recursive: true });
  await writeFile('dev-callback/.well-known/assetlinks.json', JSON.stringify([{
    relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app',
      package_name: 'com.addi.app.dev', sha256_cert_fingerprints: [fingerprint] },
  }], null, 2) + '\n');
}
