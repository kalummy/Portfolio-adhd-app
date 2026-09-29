import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadEnv } from 'vite';

const environments = JSON.parse(await readFile('native-environments.json', 'utf8'));
const env = { ...loadEnv('production', process.cwd(), 'VITE_NATIVE_'), ...process.env };
const stage = process.env.ADDI_NATIVE_STAGE;
if (!['development', 'production'].includes(stage) || env.VITE_NATIVE_STAGE !== stage)
  throw new Error('Native build stages must match');
const selected = environments[stage];
if (env.VITE_NATIVE_SUPABASE_URL !== selected.supabaseUrl
  || !env.VITE_NATIVE_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_'))
  throw new Error('Native Supabase configuration mismatch');
const callback = new URL(env.VITE_NATIVE_AUTH_CALLBACK);
if (callback.protocol !== 'https:' || callback.username || callback.password || callback.port
  || callback.search || callback.hash || callback.pathname !== '/auth/native/callback'
  || callback.hostname === 'localhost' || callback.hostname.endsWith('.invalid')
  || (stage === 'production' ? callback.href !== selected.callback : callback.href === environments.production.callback))
  throw new Error('Native callback configuration mismatch');
if (stage === 'production') {
  if (process.env.NATIVE_DEBUG_SHA256) throw new Error('Dev fingerprint in Production');
  const links = JSON.parse(await readFile('../../public/.well-known/assetlinks.json', 'utf8'));
  if (!links.some(entry => entry.target?.namespace === 'android_app'
    && entry.target.package_name === selected.package
    && entry.target.sha256_cert_fingerprints?.includes(selected.playSigningSha256)
    && entry.relation?.includes('delegate_permission/common.handle_all_urls')))
    throw new Error('Production App Link signing association missing');
}
const nativeApiUrl = `${selected.supabaseUrl}/functions/v1/native-api`;
const nativePushUrl = `${selected.supabaseUrl}/functions/v1/native-push`;
await writeFile('android/native-auth.properties',
  `# Generated; public build identifiers only.\nnativeStage=${stage}\nnativePackage=${selected.package}\nnativeSupabaseUrl=${selected.supabaseUrl}\nnativeApiUrl=${nativeApiUrl}\nnativePushUrl=${nativePushUrl}\nauthCallbackHost=${callback.hostname}\n`);
const fingerprint = process.env.NATIVE_DEBUG_SHA256;
if (stage === 'development' && fingerprint) {
  if (!/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(fingerprint)) throw new Error('Invalid debug fingerprint');
  await mkdir('dev-callback/.well-known', { recursive: true });
  await writeFile('dev-callback/.well-known/assetlinks.json', JSON.stringify([{
    relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app',
      package_name: selected.package, sha256_cert_fingerprints: [fingerprint] },
  }], null, 2) + '\n');
}
