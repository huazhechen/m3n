import { defineConfig } from 'vitest/config'
import { testSettings } from '../../tools/vitest-settings'

export default defineConfig({
  test: { ...testSettings, include: ['src/**/*.test.ts'], testTimeout: 30000 },
})
