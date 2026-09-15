import {build} from '../apps/native/node_modules/esbuild/lib/main.js';
await build({stdin:{contents:"export * from './lib/native-push/server'; export * from './lib/native-push/fcm'; export * from './lib/native-push/contracts'; export * from './lib/native-push/scheduler'; export {getReminderContent} from './lib/reminders/policy';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'neutral',format:'esm',target:'es2022',outfile:'supabase/functions/native-push/bundle.js'});
console.log('Built Dev Native Push Edge entry; no credentials embedded.');
