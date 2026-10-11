import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // The server side (worker/index.ts) runs beside the dev server: `npx wrangler dev --port 8787`.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
});
