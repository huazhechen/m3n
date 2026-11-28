/** Audits and E2E use the same Playwright-pinned browser by default. */
export function chromiumExecutablePath(env = process.env) {
  return env.CHROMIUM_PATH || undefined
}

/** Shared by audits, exports and Playwright. Keep separate browser processes:
 * --single-process can crash on Linux and breaks context recreation.
 */
export function chromiumLaunchOptions({ heapMb = 256, exposeGc = false, lowMemory = false } = {}) {
  return {
    headless: true,
    executablePath: chromiumExecutablePath(),
    args: ['--disable-gpu', '--renderer-process-limit=1',
      `--js-flags=${exposeGc ? '--expose-gc ' : ''}--max-old-space-size=${heapMb}`,
      '--disable-features=SpareRendererForSitePerProcess' + (lowMemory ? ',IsolateOrigins,site-per-process' : ''),
      ...(lowMemory ? ['--disable-site-isolation-trials', '--no-zygote'] : [])],
  }
}
