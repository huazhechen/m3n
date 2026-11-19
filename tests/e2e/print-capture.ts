import { expect, type Page } from '@playwright/test'

export async function captureBrowserPrint(page: Page) {
  await page.addInitScript(() => {
    window.print = () => {
      const host = window.top as Window & { printedScore?: string }
      host.printedScore = document.documentElement.outerHTML
      window.dispatchEvent(new Event('afterprint'))
    }
  })
}

export async function printedScorePdf(page: Page) {
  await expect.poll(() => page.evaluate(() => (window as Window & { printedScore?: string }).printedScore)).toBeTruthy()
  const html = await page.evaluate(() => {
    const host = window as Window & { printedScore?: string }
    const markup = host.printedScore!
    delete host.printedScore
    return markup
  })
  const printed = await page.context().newPage()
  try {
    await printed.setContent(html)
    await printed.evaluate(() => document.fonts.ready)
    return { html, pdf: await printed.pdf({ preferCSSPageSize: true, printBackground: true }) }
  } finally { await printed.close() }
}
