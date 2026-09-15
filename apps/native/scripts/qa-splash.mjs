import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
const serial = process.env.ANDROID_SERIAL || 'emulator-5554';
if (!serial.startsWith('emulator-')) throw new Error('Disposable emulator only');
const out = 'qa-artifacts/android';
await mkdir(out, {recursive:true});
const adb = (...args) => execFileSync('adb',['-s',serial,...args], { maxBuffer: 16 * 1024 * 1024 });
if (!adb('emu', 'avd', 'name').toString().startsWith('addi_phase1_')) throw new Error('Expected a Phase 1 disposable AVD');
adb('shell','am','force-stop','com.addi.app');
const recording = spawn('adb',['-s',serial,'shell','screenrecord','--time-limit','6','/sdcard/addi-phase1-cold-start.mp4']);
const finished = new Promise((resolve,reject)=>{ recording.once('exit',code=>code===0?resolve():reject(new Error(`recording ${code}`))); });
await new Promise(r=>setTimeout(r,300));
const launch = spawn('adb',['-s',serial,'shell','am','start','-W','-n','com.addi.app/.MainActivity']);
let launchText='';launch.stdout.on('data',d=>{launchText+=d;});
const launched = new Promise(r=>launch.once('exit',r));
for(let frame=0;frame<8;frame++) {
  await new Promise(r=>setTimeout(r,100));
  await writeFile(`${out}/splash-${frame}.png`,adb('exec-out','screencap','-p'));
}
await launched;await finished;
adb('pull','/sdcard/addi-phase1-cold-start.mp4',`${out}/cold-start.mp4`);
await writeFile(`${out}/splash-launch.txt`,launchText);
console.log(launchText);
