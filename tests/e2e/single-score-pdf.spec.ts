import { test, expect, devices } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'

test.use({ ...devices['Pixel 7'] })

test('Android PDF download keeps a full song on one A4 page without browser printing', async ({ page }, info) => {
  await page.addInitScript(() => {
    window.print = () => { throw new Error('Printing unavailable') }
  })
  const requests: string[] = []
  page.on('request', request => requests.push(request.url()))
  await page.goto('/scores/yue_ding_01')
  await expect(page.locator('.score-paper svg').first()).toBeVisible()
  await page.getByRole('button', { name: '打印', exact: true }).click()
  const dialog = page.locator('.export-dialog')
  await expect(dialog.locator('.export-preview')).toHaveAttribute('aria-busy', 'false')
  const started = Date.now()
  const downloading = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'PDF', exact: true }).click()
  const download = await downloading
  const elapsed = Date.now() - started
  await info.attach('pdf-download-ms', { body: String(elapsed), contentType: 'text/plain' })
  console.log(`Android-emulated single-song PDF download: ${elapsed}ms`)
  expect(download.suggestedFilename()).toBe('约定.pdf')
  const path = info.outputPath(download.suggestedFilename())
  await download.saveAs(path)
  const pdf = await PDFDocument.load(await readFile(path))
  expect(pdf.getPageCount()).toBe(1)
  expect(pdf.getPage(0).getWidth()).toBeCloseTo(210 * 72 / 25.4)
  expect(pdf.getPage(0).getHeight()).toBeCloseTo(297 * 72 / 25.4)
  expect(requests.some(url => /\/api\/|\.(?:otf|ttf|woff2?)(?:$|\?)/.test(url))).toBe(false)
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('iframe[title="乐谱打印"]')).toHaveCount(0)
})
