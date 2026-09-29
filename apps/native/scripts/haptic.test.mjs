import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
test('selection is Native only, ignores active tab, and coalesces rapid taps',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'addi-haptic-test-'));
 const fake=join(dir,'capacitor.mjs');await writeFile(fake,'export const Capacitor={isNativePlatform:()=>globalThis.__hapticNative};export const registerPlugin=()=>({selection:async()=>{globalThis.__hapticCalls++}});');
 const output=join(dir,'haptic.mjs');await build({entryPoints:[resolve('src/platform/haptic.ts')],outfile:output,bundle:true,format:'esm',platform:'node',alias:{'@capacitor/core':fake}});
 const {navigationHaptic}=await import(pathToFileURL(output));globalThis.__hapticCalls=0;globalThis.__hapticNative=false;
 navigationHaptic(false);assert.equal(globalThis.__hapticCalls,0);
 globalThis.__hapticNative=true;navigationHaptic(true);assert.equal(globalThis.__hapticCalls,0);
 navigationHaptic(false);navigationHaptic(false);assert.equal(globalThis.__hapticCalls,1);
 await new Promise(r=>setTimeout(r,130));navigationHaptic(false);assert.equal(globalThis.__hapticCalls,2);
 delete globalThis.__hapticCalls;delete globalThis.__hapticNative;
});
