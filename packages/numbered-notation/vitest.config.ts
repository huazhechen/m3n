import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Corpus cases render several view modes, each trying three spacings.
  test: { include: ['src/**/*.test.ts'], testTimeout: 30000 },
})
