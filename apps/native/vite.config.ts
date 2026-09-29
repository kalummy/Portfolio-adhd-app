import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { nativeAliases } from './native-aliases';
const root = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  plugins: [react(), {
    name: 'addi-native-boundary',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === './mixpanel' && importer === resolve(root, 'lib/analytics/events.ts')) return fileURLToPath(new URL('./src/adapters/analytics-transport.ts', import.meta.url));
      if (source === '../mood-draft' && importer === resolve(root, 'lib/analytics/events.ts')) return fileURLToPath(new URL('./src/adapters/mood-draft.ts', import.meta.url));
      // Only the bundled Home receives a separate body scrollport.
      if (source === './mobile-shell' && importer === resolve(root, 'components/home-screen.tsx')) {
        return fileURLToPath(new URL('./src/platform/home-shell.tsx', import.meta.url));
      }
    },
    transform(code, id) {
      if (id === resolve(root, 'app/medications/new/photo/page.tsx')) return 'import { nativeGetUserMedia } from "' + fileURLToPath(new URL('./src/platform/camera.ts', import.meta.url)) + '";\n' + code.replace('navigator.mediaDevices.getUserMedia({', 'nativeGetUserMedia({');
      if (id === resolve(root, 'lib/photo-recognition.ts')) return 'import { createNativeOcrWorker } from "' + fileURLToPath(new URL('./src/platform/ocr.ts', import.meta.url)) + '";\n' + code.replace('createWorker(["kor", "eng"])', 'createNativeOcrWorker()');
      // Adapt only CSS inset reads at build time; the web stylesheet stays byte-identical.
      if (id === resolve(root, 'app/globals.css')) return code.replace(/env\(safe-area-inset-(top|bottom|left|right)\)/g, 'var(--safe-area-inset-$1, env(safe-area-inset-$1, 0px))');
    },
    generateBundle() {
      const forbidden = [...this.getModuleIds()].filter(id => /node_modules\/(?:next\/|mixpanel-browser\/|web-push\/)|\/lib\/(?:supabase\/|auth\/client\.ts|push\/client\.ts|analytics\/mixpanel\.ts|indexed-db\.ts)|\/app\/api\//.test(id));
      if (forbidden.length) this.error(`Native boundary violation:\n${forbidden.join('\n')}`);
    },

  }],
  publicDir: 'public',
  resolve: { alias: [
    ...(process.env.ADDI_NATIVE_PROFILE === "1" ? [{ find: "react-dom/client", replacement: resolve(root, "node_modules/react-dom/profiling.js") }] : []),
    ...Object.entries(nativeAliases).map(([find, path]) => ({ find: new RegExp(`^${find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), replacement: resolve(path) })),
    { find: '@', replacement: root },
  ], dedupe: ['react', 'react-dom'] },
  build: { target: 'es2022', sourcemap: false },
});
