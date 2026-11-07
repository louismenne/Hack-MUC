import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { policyApiPlugin } from './src/policy-api/vite-plugin.js';

/** Local dev: serve the standalone claim form at /claim (same address as on Vercel). */
const claimRoute = {
  name: 'claim-route',
  configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: unknown, next: () => void) => void) => void } }) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === '/claim' || req.url?.startsWith('/claim?')) req.url = `/claim/${req.url.slice('/claim'.length)}`;
      next();
    });
  },
};

export default defineConfig({
  root: 'web',
  plugins: [claimRoute, react(), tailwindcss(), policyApiPlugin(fileURLToPath(new URL('.', import.meta.url)))],
  resolve: { alias: { '@': fileURLToPath(new URL('./web/src', import.meta.url)) } },
  server: { port: 5173, fs: { allow: ['..'] }, proxy: { '/api': 'http://127.0.0.1:3002' } },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // Two HTML entries: the main app (/) and the standalone claim form (/claim/).
    rollupOptions: { input: { main: fileURLToPath(new URL('./web/index.html', import.meta.url)), claim: fileURLToPath(new URL('./web/claim/index.html', import.meta.url)) } },
  },
});
