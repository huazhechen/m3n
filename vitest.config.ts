import { defineConfig } from 'vitest/config'
import { scoreCatalogPlugin } from './tools/score-catalog-plugin.ts'

export default defineConfig({
  plugins: [scoreCatalogPlugin()],
  test: {
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
  },
})
