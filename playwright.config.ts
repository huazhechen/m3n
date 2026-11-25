import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

const systemChromium = process.env.CHROMIUM_PATH ?? ['/usr/bin/chromium', '/usr/sbin/chromium', '/usr/bin/chromium-browser']
  .find((path) => existsSync(path))

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
    channel: browserName === 'chromium' && !systemChromium ? 'msedge' : undefined,
    launchOptions: browserName === 'chromium' ? {
      ...(systemChromium ? { executablePath: systemChromium } : {}),
      args: ['--disable-gpu', '--renderer-process-limit=1', `--js-flags=--max-old-space-size=${lowMemory ? 256 : 384}`,
        ...(lowMemory ? ['--disable-features=SpareRendererForSitePerProcess'] : [])],
    } : undefined,
    headless: true,
  },
  webServer: {
    command: `${process.env.M3N_E2E_SKIP_BUILD === '1' ? '' : `VITE_BASE_URL=/ VITE_SUBMIT_MODE=local npm run build -- --outDir ${previewOutput} && `}node tools/serve-built-web.mjs --root=${previewOutput} --port=${previewPort}`,
    url: `http://127.0.0.1:${previewPort}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
