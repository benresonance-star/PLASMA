import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: '.',
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
      // Prefer package source in dev so causal-lens / projection edits apply without a dist rebuild.
      '@spds/graph-projection': path.resolve(rootDir, '../../packages/graph-projection/src/index.ts'),
      '@spds/ai-interface': path.resolve(rootDir, '../../packages/ai-interface/src/index.ts'),
      '@spds/semantic-core': path.resolve(rootDir, '../../packages/semantic-core/src/index.ts'),
    },
  },
  server: {
    // Bind IPv4 explicitly — on some Windows setups Vite defaults to ::1 only,
    // which makes http://127.0.0.1:5173 (and some localhost resolutions) refuse.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist-app',
    emptyOutDir: true,
  },
});
