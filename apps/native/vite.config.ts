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
    transform(code, id) {
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
    ...Object.entries(nativeAliases).map(([find, path]) => ({ find: new RegExp(`^${find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), replacement: resolve(path) })),
    { find: '@', replacement: root },
  ], dedupe: ['react', 'react-dom'] },
  build: { target: 'es2022', sourcemap: false },
});
