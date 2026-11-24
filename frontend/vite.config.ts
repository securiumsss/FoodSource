import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@food-suppliers/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)) } },
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
