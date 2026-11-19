import { test, expect, devices } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import { execFileSync, spawnSync } from 'node:child_process'

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
  expect(requests.some(url => /builtin-pdf-text.*\.ttf/.test(url))).toBe(false)
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
  expect(fontRows.some(row => /NotoSerif.*yes\s+yes\s+yes/.test(row))).toBe(true)
  expect(fontRows.filter(row => /yes\s+yes\s+yes/.test(row))).toHaveLength(2)
  const images = execFileSync('pdfimages', ['-list', path], { encoding: 'utf8' }).trim().split('\n').slice(2)
  expect(images).toEqual([])
  const text = execFileSync('pdftotext', [path, '-'], { encoding: 'utf8' }).replace(/\s/g, '')
  expect(text).toContain('约定')
  expect(text).toContain('姚若龙')
  const render = spawnSync('pdftoppm', ['-f', '1', '-singlefile', '-scale-to', '800', '-png', path, info.outputPath('rendered-score')], { encoding: 'utf8' })
  expect(render.status).toBe(0)
  expect(render.stderr).toBe('')
  expect(requests.some(url => /\/api\//.test(url))).toBe(false)
  expect(requests.filter(url => /builtin-pdf-text.*\.ttf/.test(url))).toHaveLength(1)
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

for (const covered of [true, false]) test(`local PDF uses complete font coverage or falls back for missing characters (${covered})`, async ({ page }, info) => {
  await page.addInitScript((covered) => {
    localStorage.setItem('m3n:local-scores', JSON.stringify([
      { id: 'local-font-test', source: `{title=${covered ? '小星星' : '本地𠀀字体验证'}}{4/4}\nN: 1 2 3 4 |||\nL: 春天来了`, createdAt: '2026-11-19T00:00:00Z', expiresAt: null },
    ]))
  }, covered)
  const fonts: string[] = []
  page.on('request', request => { if (/\.(?:otf|ttf|woff2?)(?:$|\?)/.test(request.url())) fonts.push(request.url()) })
  await page.goto('/scores/local-font-test')
  await page.getByRole('button', { name: '打印', exact: true }).click()
  const dialog = page.locator('.export-dialog')
  await expect(dialog.locator('.export-preview')).toHaveAttribute('aria-busy', 'false')
  expect(fonts).toEqual([])
  const downloading = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'PDF', exact: true }).click()
  const download = await downloading
  const path = info.outputPath('local-font.pdf')
  await download.saveAs(path)
  const rows = execFileSync('pdffonts', [path], { encoding: 'utf8' })
  if (covered) {
    expect(rows).toMatch(/NotoSerif.*yes\s+yes\s+yes/)
    const text = execFileSync('pdftotext', [path, '-'], { encoding: 'utf8' })
    for (const char of '小星星春天来了') expect(text).toContain(char)
  }
  else { expect(rows).toMatch(/STSong-Light.*no\s+no\s+yes/); expect(rows).not.toContain('NotoSerif') }
  expect(fonts.filter(url => /builtin-pdf-text.*\.ttf/.test(url))).toHaveLength(1)
})

for (const failure of ['download', 'parse']) test(`font ${failure} failure falls back without blocking PDF export`, async ({ page }, info) => {
  let failures = 0
  await page.route('**/builtin-pdf-text*.ttf', route => {
    if (!failures++) return route.fulfill({ status: failure === 'download' ? 503 : 200, body: 'invalid font data' })
    return route.continue()
  })
  await page.goto('/scores/yue_ding_01')
  await page.getByRole('button', { name: '打印', exact: true }).click()
  await expect(page.locator('.export-preview')).toHaveAttribute('aria-busy', 'false')
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'PDF', exact: true }).click()
  const download = await downloading
  const path = info.outputPath('fallback.pdf')
  await download.saveAs(path)
  const fonts = execFileSync('pdffonts', [path], { encoding: 'utf8' })
  expect(fonts).toContain('STSong-Light')
  expect(fonts).not.toContain('NotoSerif')
  expect(failures).toBe(1)
})
