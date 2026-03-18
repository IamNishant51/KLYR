import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: path.join(__dirname, 'webview-src'),
  build: {
    outDir: path.join(__dirname, 'dist', 'webview'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'main.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
    minify: 'terser',
    sourcemap: false,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
