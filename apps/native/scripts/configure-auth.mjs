import { mkdir, writeFile } from 'node:fs/promises';
import { loadEnv } from 'vite';
const env = { ...loadEnv('production', process.cwd(), 'VITE_NATIVE_'), ...process.env };
const value = env.VITE_NATIVE_AUTH_CALLBACK;
let host = 'native-auth-disabled.invalid';
if (value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash
    || url.pathname !== '/auth/native/callback' || url.hostname === 'addi-gamma.vercel.app'
    || url.hostname === 'localhost' || url.hostname.endsWith('.invalid')) throw new Error('Invalid Dev callback');
  host = url.hostname;
}
await writeFile('android/native-auth.properties', `# Generated, Dev only. Never add Production hosts.\nauthCallbackHost=${host}\n`);
const fingerprint = process.env.NATIVE_DEBUG_SHA256;
if (fingerprint) {
  if (!/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(fingerprint)) throw new Error('Invalid debug fingerprint');
  await mkdir('dev-callback/.well-known', { recursive: true });
  await writeFile('dev-callback/.well-known/assetlinks.json', JSON.stringify([{
    relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app',
      package_name: 'com.addi.app.dev', sha256_cert_fingerprints: [fingerprint] },
  }], null, 2) + '\n');
}
