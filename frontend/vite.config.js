import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // In production this is same-origin, served by the Worker itself
    // (see worker.js). Locally, run `npm run worker:dev` alongside `npm run
    // dev` and this proxies /api/* to it instead.
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
