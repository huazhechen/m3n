import { defineConfig } from '@playwright/test'
import { chromiumLaunchOptions } from './tools/lib/chromium-options.mjs'

const previewPort = Number(process.env.M3N_E2E_PORT ?? 4173)
const previewOutput = `.tmp/playwright-dist-${previewPort}`
const browserName = process.env.M3N_E2E_BROWSER === 'webkit' ? 'webkit' : 'chromium'
const lowMemory = process.env.M3N_E2E_LOW_MEMORY === '1'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  use: {
    baseURL: `http://127.0.0.1:${previewPort}`,
    browserName,
    launchOptions: browserName === 'chromium' ? chromiumLaunchOptions({ heapMb: lowMemory ? 192 : 384, lowMemory }) : undefined,
    headless: true,
  },
  webServer: {
    command: `${process.env.M3N_E2E_SKIP_BUILD === '1' ? '' : `VITE_BASE_URL=/ VITE_SUBMIT_MODE=local npm run build -- --outDir ${previewOutput} && `}node tools/serve-built-web.mjs --root=${previewOutput} --port=${previewPort}`,
    url: `http://127.0.0.1:${previewPort}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
