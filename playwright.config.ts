import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

const systemChromium = ['/usr/bin/chromium', '/usr/sbin/chromium', '/usr/bin/chromium-browser']
  .find((path) => existsSync(path))

const previewPort = Number(process.env.M3N_E2E_PORT ?? 4173)
const previewOutput = `.tmp/playwright-dist-${previewPort}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  timeout: 45_000,
  use: {
    baseURL: `http://127.0.0.1:${previewPort}`,
    browserName: 'chromium',
    channel: systemChromium ? undefined : 'msedge',
    launchOptions: systemChromium ? { executablePath: systemChromium } : undefined,
    headless: true,
  },
  webServer: {
    command: `VITE_SUBMIT_MODE=local npm run build -- --outDir ${previewOutput} && npm run preview -- --outDir ${previewOutput} --host 127.0.0.1 --port ${previewPort}`,
    url: `http://127.0.0.1:${previewPort}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
