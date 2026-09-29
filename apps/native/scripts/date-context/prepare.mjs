import {build} from 'esbuild';
import {mkdir,writeFile,symlink} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../../..');
const output=resolve(root,'apps/native/qa-artifacts/date-context');
await mkdir(output,{recursive:true});
const fixture=resolve(here,'fixtures.mjs');
const aliases={
 '@/lib/repositories':fixture,'@/lib/auth/client':fixture,'@/lib/notifications':fixture,
 '@/lib/analytics/events':resolve(here,'analytics-fixture.ts'),
 '@/lib/medication-enrichment':fixture
};
const {nativeAliases}=await import(resolve(root,'apps/native/native-aliases.ts'));
await build({stdin:{contents:`import {createRoot} from 'react-dom/client';import {NativeApp} from './apps/native/src/app';import {router} from './apps/native/src/platform/router';import {startNativeLifecycle,handleNativeBack} from './apps/native/src/platform/lifecycle';import './app/globals.css';window.__DATE_QA_ROUTER__=router;window.__DATE_QA_BACK__=handleNativeBack;void startNativeLifecycle();createRoot(document.getElementById('root')).render(<NativeApp/>);`,resolveDir:root,loader:'tsx'},bundle:true,format:'esm',platform:'browser',jsx:'automatic',outfile:resolve(output,'native.js'),loader:{'.woff2':'file','.woff':'file'},external:['/icons/*'],alias:{'@':root,'react':resolve(root,'node_modules/react'),'react-dom':resolve(root,'node_modules/react-dom')},plugins:[{name:'synthetic-auth',setup(b){const map={...Object.fromEntries(Object.entries(nativeAliases).map(([k,v])=>[k,resolve(root,'apps/native',v)])),...aliases};b.onResolve({filter:/.*/},args=>map[args.path]?{path:map[args.path]}:undefined);b.onResolve({filter:/adapters\/analytics$/},()=>({path:resolve(here,'analytics-fixture.ts')}));b.onResolve({filter:/runtime$/},args=>resolve(args.resolveDir,args.path)===resolve(root,'apps/native/src/auth/runtime')?{path:fixture}:undefined);}}],define:{'process.env.NEXT_PUBLIC_VERCEL_ENV':'"development"','process.env.NEXT_PUBLIC_MIXPANEL_TOKEN':'""','process.env.NODE_ENV':'"development"','import.meta.env':'{}'}});
await writeFile(resolve(output,'index.html'),'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/native.css"></head><body><div id="root"></div><script type="module" src="/native.js"></script></body></html>');
const web=resolve(output,'web');await mkdir(resolve(web,'app'),{recursive:true});
await symlink(resolve(root,'node_modules'),resolve(web,'node_modules')).catch(e=>{if(e.code!=='EEXIST')throw e;});
await symlink(resolve(root,'public'),resolve(web,'public')).catch(e=>{if(e.code!=='EEXIST')throw e;});
await writeFile(resolve(web,'package.json'),JSON.stringify({private:true,scripts:{dev:'next dev --webpack -p 4196'},dependencies:{next:'16.3.1',react:'19.2.8','react-dom':'19.2.8'}}));
await writeFile(resolve(web,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',jsx:'react-jsx',esModuleInterop:true,moduleResolution:'bundler',module:'esnext',skipLibCheck:true,paths:{'@/*':[root+'/*']}},include:['app/**/*.tsx']}));
await writeFile(resolve(web,'next.config.mjs'),`export default {reactStrictMode:false,webpack(config){Object.assign(config.resolve.alias,${JSON.stringify({...Object.fromEntries(Object.entries(aliases).map(([k,v])=>[k+'$',v])),'@':root})});return config;}};`);
await writeFile(resolve(web,'app/layout.tsx'),`import ${JSON.stringify(resolve(root,'app/globals.css'))};import Probe from './probe';export default function Layout({children}){return <html><body><Probe/>{children}</body></html>}`);
await writeFile(resolve(web,'app/probe.tsx'),`'use client';import {useRouter} from 'next/navigation';import {useEffect} from 'react';import ${JSON.stringify(fixture)};export default function Probe(){const router=useRouter();useEffect(()=>{window.__DATE_QA_ROUTER__=router;},[router]);return null;}`);
for(const path of ['page.tsx','medications/page.tsx','medications/[medicationId]/schedule/page.tsx','visits/page.tsx','visits/edit/page.tsx','visits/new/page.tsx']){const target=resolve(web,'app',path);await mkdir(dirname(target),{recursive:true});await writeFile(target,`export {default} from ${JSON.stringify(resolve(root,'app',path))};`);}
console.log(output);
