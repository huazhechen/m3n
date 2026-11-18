import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

const systemChromium = ['/usr/bin/chromium', '/usr/sbin/chromium', '/usr/bin/chromium-browser']
  .find((path) => existsSync(path))

const previewPort = Number(process.env.M3N_E2E_PORT ?? 4173)
const previewOutput = `.tmp/playwright-dist-${previewPort}`
const browserName = process.env.M3N_E2E_BROWSER === 'webkit' ? 'webkit' : 'chromium'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  timeout: 45_000,
  use: {
    baseURL: `http://127.0.0.1:${previewPort}`,
    browserName,
    channel: browserName === 'chromium' && !systemChromium ? 'msedge' : undefined,
    launchOptions: browserName === 'chromium' && systemChromium ? { executablePath: systemChromium } : undefined,
    headless: true,
  },
  webServer: {
    command: `VITE_BASE_URL=/ VITE_SUBMIT_MODE=local npm run build -- --outDir ${previewOutput} && VITE_BASE_URL=/ VITE_SUBMIT_MODE=local npm run preview -- --outDir ${previewOutput} --host 127.0.0.1 --port ${previewPort}`,
    url: `http://127.0.0.1:${previewPort}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
