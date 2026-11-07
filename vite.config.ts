import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { policyApiPlugin } from './src/policy-api/vite-plugin.js';

export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss(), policyApiPlugin(fileURLToPath(new URL('.', import.meta.url)))],
  resolve: { alias: { '@': fileURLToPath(new URL('./web/src', import.meta.url)) } },
  server: { port: 5173, fs: { allow: ['..'] }, proxy: { '/api': 'http://127.0.0.1:3002' } },
  build: { outDir: '../dist', emptyOutDir: true },
});
