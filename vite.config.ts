import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Tells the service worker (public/sw.js) which files the build made and which covers there
 * are, so it can keep the code of every page and the whole wall for when there is no network.
 * The names of the built files change with every build.
 */
const builtList = (): Plugin => {
  let out = 'dist';
  return {
    name: 'incipit-built-list',
    apply: 'build',
    configResolved(config) {
      out = config.build.outDir;
    },
    closeBundle() {
      const built = readdirSync(join(out, 'assets'))
        .filter((name) => /\.(js|css)$/.test(name))
        .map((name) => `/assets/${name}`);
      const covers = readdirSync(join(out, 'covers')).map((name) => `/covers/${name}`);
      const worker = join(out, 'sw.js');
      const text = readFileSync(worker, 'utf8').replace('/*BUILT*/ []', JSON.stringify(built)).replace('/*COVERS*/ []', JSON.stringify(covers));
      writeFileSync(worker, text);
    },
  };
};

export default defineConfig({
  plugins: [react(), builtList()],
  server: {
    port: 5173,
    strictPort: true,
    // The server side (worker/index.ts) runs beside the dev server: `npx wrangler dev --port 8787`.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
});
