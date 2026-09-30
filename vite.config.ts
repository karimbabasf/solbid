import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  resolve: { alias: { '@shared': new URL('./shared', import.meta.url).pathname } },
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: { '/api': 'http://localhost:8787', '/x402': 'http://localhost:8787' },
  },
  build: { outDir: '../dist', emptyOutDir: true },
});
