import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from '../apps/native/node_modules/esbuild/lib/main.js';

const devRef = 'ohobxicxchkaisxxswkk';
const prodRef = 'joffvlsyxivveqycjrio';
const root = process.cwd();
const productionOnly = {
  name: 'production-supabase-reference',
  setup(bundler) {
    bundler.onLoad({ filter: /\.ts$/ }, async ({ path }) => {
      if (!path.startsWith(root + '/')) return;
      const source = await readFile(path, 'utf8');
      return { contents: source.replaceAll(devRef, prodRef), loader: 'ts' };
    });
  },
};
function replaceExactlyOnce(source, before, after) {
  if (source.split(before).length !== 2) throw Error('Production Edge entry changed unexpectedly');
  return source.replace(before, after);
}

for (const name of ['native-api', 'native-push']) {
  const dir = resolve(root, 'supabase/functions', name, 'production');
  await mkdir(dir, { recursive: true });
  const bundlePath = resolve(dir, 'bundle.js');
  const apiOptions = name === 'native-api' ? {
    entryPoints: ['lib/native-api/server.ts'],
    define: {
      'process.env.MFDS_SERVICE_KEY': 'ADDI_MFDS_KEY',
      'process.env.MFDS_PILL_IDENTIFICATION_SERVICE_KEY': 'ADDI_MFDS_PILL_KEY',
    },
    banner: { js: 'const ADDI_MFDS_KEY = globalThis.Deno?.env.get("ADDI_PROD_MFDS_SERVICE_KEY"); const ADDI_MFDS_PILL_KEY = globalThis.Deno?.env.get("ADDI_PROD_MFDS_PILL_IDENTIFICATION_SERVICE_KEY");' },
    plugins: [{ name: 'server-client-injection', setup(bundler) {
      bundler.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: 'injected-client', namespace: 'native-api' }));
      bundler.onLoad({ filter: /.*/, namespace: 'native-api' }, () => ({ contents: 'export function createBrowserSupabaseClient(){throw new Error("authenticated_client_required");}', loader: 'js' }));
    } }, productionOnly],
  } : {
    stdin: { contents: "export * from './lib/native-push/server'; export * from './lib/native-push/fcm'; export * from './lib/native-push/contracts'; export * from './lib/native-push/scheduler'; export * from './lib/native-environment'; export {getReminderContent} from './lib/reminders/policy';", resolveDir: root, loader: 'ts' },
    plugins: [productionOnly],
  };
  await build({
    ...apiOptions,
    bundle: true, platform: 'neutral', format: 'esm', target: 'es2022',
    outfile: bundlePath,
  });
  let index = await readFile(resolve(root, 'supabase/functions', name, 'index.js'), 'utf8');
  if (name === 'native-api') {
    index = replaceExactlyOnce(index,
      "const stage = nativeStage(Deno.env.get('ADDI_NATIVE_STAGE'));",
      "const stage = 'production';");
  } else {
    index = replaceExactlyOnce(index,
      'const stage = nativeStage(Deno.env.get("ADDI_NATIVE_STAGE"));',
      'const stage = "production";');
    index = replaceExactlyOnce(index,
      'const firebaseProject = stage === "production"\n  ? Deno.env.get("ADDI_NATIVE_FIREBASE_PROJECT_ID")\n  : DEV_FIREBASE;\nif (!firebaseProject)\n  throw Error("native_firebase_project_required");',
      'const configuredFirebaseProject = Deno.env.get("ADDI_NATIVE_FIREBASE_PROJECT_ID");\nif (configuredFirebaseProject && configuredFirebaseProject !== "addi-503b5")\n  throw Error("native_firebase_project_mismatch");\nconst firebaseProject = "addi-503b5";');
    index = replaceExactlyOnce(index,
      'const send = createFcmSender(\n  JSON.parse(Deno.env.get(stage === "production" ? "ADDI_PROD_FCM_CREDENTIAL" : "ADDI_DEV_FCM_CREDENTIAL") || "{}"),\n  fetch,\n  firebaseProject,\n);',
      'const productionCredential = Deno.env.get("ADDI_PROD_FCM_CREDENTIAL");\nconst send = productionCredential\n  ? createFcmSender(JSON.parse(productionCredential), fetch, firebaseProject)\n  : async () => { throw Error("production_fcm_not_configured"); };');
  }
  const bundle = await readFile(bundlePath, 'utf8');
  if (index.includes(devRef) || bundle.includes(devRef)) throw Error('Dev Supabase ref in Production artifact');
  if (name === 'native-push' && (index.includes('ADDI_DEV_FCM_CREDENTIAL')
    || index.includes('scheduler|scheduler-send')
    || !index.includes('if (pathname.endsWith("/scheduler-send"))'))) throw Error('Production Push route boundary missing');
  await writeFile(resolve(dir, 'index.js'), index);
  console.log(`${name}: Production-only Edge artifact ready; Dev Supabase ref absent`);
}
