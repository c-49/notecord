import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'NoteCord',
        short_name: 'NoteCord',
        description: 'Discord-style personal notes app',
        theme_color: '#5865f2',
        background_color: '#1e1f22',
        display: 'standalone',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico}'],
      },
    }),
  ],
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
