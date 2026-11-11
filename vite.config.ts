import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { scoreCatalogPlugin } from './tools/score-catalog-plugin.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), scoreCatalogPlugin()],
  build: {
    chunkSizeWarningLimit: 800,
  },
})
