import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
export const assetDirectories = ['icons', 'medications', 'moods', 'cats', 'lottie', 'profile', 'brand', 'auth'];
const destination = new URL('../public/', import.meta.url);
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const dir of assetDirectories) await cp(new URL(`../../../public/${dir}`, import.meta.url), new URL(dir, destination), { recursive: true });
console.log(`Copied ${assetDirectories.length} shared asset directories to ${fileURLToPath(destination)}`);

// Bundle the existing Web OCR engine; no CDN execution inside Native WebView.
await mkdir(new URL('ocr/',destination),{recursive:true});
await cp(new URL('../../../node_modules/tesseract.js/dist/worker.min.js',import.meta.url),new URL('ocr/worker.min.js',destination));
await cp(new URL('../../../node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt',import.meta.url),new URL('ocr/worker.LICENSE.txt',destination));
for (const file of ['tesseract-core-lstm.wasm.js','tesseract-core-lstm.wasm']) await cp(new URL('../../../node_modules/tesseract.js-core/'+file,import.meta.url),new URL('ocr/'+file,destination));
await cp(new URL('../ocr-data/',import.meta.url),new URL('ocr/lang/',destination),{recursive:true});
for (const language of ['kor','eng']) {
  const compressed = new URL('ocr/lang/'+language+'.traineddata.gz',destination);
  await writeFile(new URL('ocr/lang/'+language+'.traineddata',destination),gunzipSync(await readFile(compressed)));
  await rm(compressed);
}

await cp(new URL('../../../node_modules/tesseract.js-core/LICENSE',import.meta.url),new URL('ocr/core.LICENSE',destination));
