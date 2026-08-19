import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Bundle the shared contracts from source. The published entry point is
      // CommonJS for the server, and Rollup cannot tree-shake named exports out
      // of CJS — so the browser build reads the TypeScript directly. Also means
      // no rebuild of the package is needed between edits.
      '@groupchat/contracts': fileURLToPath(
        new URL('../../packages/contracts/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    // Proxied so the browser sees one origin in development — no CORS dance,
    // and the socket upgrade works without extra configuration.
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/socket.io': { target: API_TARGET, ws: true, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
