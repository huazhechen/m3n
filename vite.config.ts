import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { scoreCatalogPlugin } from './tools/score-catalog-plugin.ts'
import { standaloneWebPlugin } from './tools/standalone-web-plugin.ts'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_URL ?? '/',
  plugins: [react(), scoreCatalogPlugin(), standaloneWebPlugin()],
  build: {
    chunkSizeWarningLimit: 800,
  },
})
