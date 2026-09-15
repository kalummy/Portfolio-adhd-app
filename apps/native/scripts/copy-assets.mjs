import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
export const assetDirectories = ['icons', 'medications', 'moods', 'cats', 'lottie', 'profile', 'brand', 'auth'];
const destination = new URL('../public/', import.meta.url);
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const dir of assetDirectories) await cp(new URL(`../../../public/${dir}`, import.meta.url), new URL(dir, destination), { recursive: true });
console.log(`Copied ${assetDirectories.length} shared asset directories to ${fileURLToPath(destination)}`);
