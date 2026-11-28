import { execFileSync } from 'node:child_process'
import { defineConfig } from 'vitest/config'
import { testSettings } from './tools/vitest-settings'
import { scoreCatalogPlugin } from './tools/score-catalog-plugin.ts'

export default defineConfig({
  define: { 'import.meta.env.VITE_COMMIT_HASH': JSON.stringify(execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: import.meta.dirname, encoding: 'utf8' }).trim()) },
  plugins: [scoreCatalogPlugin()],
  test: {
    ...testSettings,
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
  },
})
