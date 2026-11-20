import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Corpus cases render several view modes, each trying up to five spacings.
  test: { include: ['src/**/*.test.ts'], testTimeout: 30000 },
})
