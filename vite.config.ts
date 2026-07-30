import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // abcjs is a single CommonJS entry and cannot be split internally. Keep it
    // isolated so application chunks remain measurable and cache independently.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          return id.includes('/node_modules/abcjs/') ? 'abcjs' : undefined
        },
      },
    },
  },
})
