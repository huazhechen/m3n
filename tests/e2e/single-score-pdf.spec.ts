import { test, expect, devices } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import { execFileSync } from 'node:child_process'

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
  const fontRows = execFileSync('pdffonts', [path], { encoding: 'utf8' }).trim().split('\n').slice(2)
  expect(fontRows.some(row => /Barlow.*yes\s+yes\s+yes/.test(row))).toBe(true)
  expect(fontRows.some(row => /STSong-Light.*no\s+no\s+yes/.test(row))).toBe(true)
  expect(fontRows.filter(row => /yes\s+yes\s+yes/.test(row))).toHaveLength(1)
  const images = execFileSync('pdfimages', ['-list', path], { encoding: 'utf8' }).trim().split('\n').slice(2)
  expect(images).toEqual([])
  const text = execFileSync('pdftotext', [path, '-'], { encoding: 'utf8' }).replace(/\s/g, '')
  expect(text).toContain('约定')
  expect(text).toContain('姚若龙')
  expect(requests.some(url => /\/api\/|\.(?:otf|ttf|woff2?)(?:$|\?)/.test(url))).toBe(false)
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('iframe[title="乐谱打印"]')).toHaveCount(0)
})

test('slow PDF module loading shows cancellable progress immediately and does not download after cancellation', async ({ page }) => {
  let release!: () => void
  const ready = new Promise<void>(resolve => { release = resolve })
  let requested = false
  await page.route('**/score-pdf-*.js', async route => { requested = true; await ready; await route.continue() })
  let downloads = 0
  page.on('download', () => downloads++)
  await page.goto('/scores/yue_ding_01')
  await page.getByRole('button', { name: '打印', exact: true }).click()
  const preview = page.locator('.export-dialog')
  await expect(preview.locator('.export-preview')).toHaveAttribute('aria-busy', 'false')
  await expect.poll(() => requested).toBe(true)
  await preview.getByRole('button', { name: 'PDF', exact: true }).click()
  const progress = page.getByRole('dialog', { name: '导出 PDF', exact: true })
  await expect(progress.getByRole('status')).toHaveText('正在加载导出模块…')
  await expect(progress.getByRole('progressbar', { name: 'PDF 生成进度' })).toBeVisible()
  await progress.getByRole('button', { name: '取消', exact: true }).click()
  await expect(progress).not.toBeVisible()
  release()
  await page.getByRole('button', { name: '打印', exact: true }).click()
  await expect(preview.locator('.export-preview')).toHaveAttribute('aria-busy', 'false')
  const downloading = page.waitForEvent('download')
  await preview.getByRole('button', { name: 'PDF', exact: true }).click()
  await downloading
  expect(downloads).toBe(1)
})
