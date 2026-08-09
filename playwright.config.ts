import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

const systemChromium = ['/usr/bin/chromium', '/usr/sbin/chromium', '/usr/bin/chromium-browser']
  .find((path) => existsSync(path))

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    channel: systemChromium ? undefined : 'msedge',
    launchOptions: systemChromium ? { executablePath: systemChromium } : undefined,
    headless: true,
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
