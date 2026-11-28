import { chromium } from '@playwright/test'
import { chromiumLaunchOptions } from './chromium-options.mjs'

/** Reuse browser startup in small batches, then release native font caches.
 * Each input still gets a fresh context; generator cleanup also covers failures.
 */
export async function* browserPages(inputs, { batchSize = 4 } = {}) {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('Browser batch size must be a positive integer')
  for (let start = 0; start < inputs.length; start += batchSize) {
    const browser = await chromium.launch(chromiumLaunchOptions())
    try {
      for (const input of inputs.slice(start, start + batchSize)) {
        const page = await browser.newPage()
        try { yield { input, page } }
        finally { await page.close() }
      }
    } finally { await browser.close() }
  }
}
