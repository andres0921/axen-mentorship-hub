import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;

// Multi-page build: mentor/admin app, mentee portal, auth confirm page.
export default defineConfig({
  base: '/',
  publicDir: 'public', // public/assets/axen-logo-white.png -> dist/assets/axen-logo-white.png
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        mentee: resolve(root, 'mentee/index.html'),
        confirm: resolve(root, 'auth/confirm/index.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
  },
});
