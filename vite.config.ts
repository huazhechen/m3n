import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { scoreCatalogPlugin } from './tools/score-catalog-plugin.ts'
import { worksCatalogPlugin } from './tools/works-catalog-plugin.ts'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_URL ?? '/',
  plugins: [react(), scoreCatalogPlugin(), worksCatalogPlugin()],
  build: {
    // Move the module graph away from URLs previously cached as SPA HTML.
    // Keep this namespace stable; Vite still hashes individual asset contents.
    assetsDir: 'assets/v2',
    chunkSizeWarningLimit: 800,
  },
})
