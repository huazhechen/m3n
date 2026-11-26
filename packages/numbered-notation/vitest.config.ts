import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Corpus cases render several view modes; retain one worker for memory.
  test: { maxWorkers: 1, include: ['src/**/*.test.ts'], testTimeout: 30000 },
})
