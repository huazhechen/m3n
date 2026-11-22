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
  const cjkBeforePdf = requests.filter(url => /NotoSansSC.*\.woff2/.test(url))
  expect(cjkBeforePdf.length).toBeGreaterThan(0)
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
  expect(fontRows.some(row => /NotoSans.*yes\s+yes\s+yes/.test(row))).toBe(true)
  expect(fontRows.every(row => /(?:Barlow|Bravura|NotoSans).*yes\s+yes\s+yes/.test(row))).toBe(true)
  const images = execFileSync('pdfimages', ['-list', path], { encoding: 'utf8' }).trim().split('\n').slice(2)
  expect(images).toEqual([])
  const text = execFileSync('pdftotext', [path, '-'], { encoding: 'utf8' }).replace(/\s/g, '')
  expect(text).toContain('约定')
  expect(text).toContain('姚若龙')
  const render = spawnSync('pdftoppm', ['-f', '1', '-singlefile', '-scale-to', '800', '-png', path, info.outputPath('rendered-score')], { encoding: 'utf8' })
  expect(render.status).toBe(0)
  expect(render.stderr).toBe('')
  expect(requests.some(url => /\/api\//.test(url))).toBe(false)
  expect(requests.filter(url => /NotoSansSC.*\.woff2/.test(url))).toEqual(cjkBeforePdf)
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

for (const covered of [true, false]) test(`local PDF embeds Source Han Sans for both preset and additional characters (${covered})`, async ({ page }, info) => {
  await page.addInitScript((covered) => {
    localStorage.setItem('m3n:local-scores', JSON.stringify([
      { id: 'local-font-test', source: `{title=${covered ? '小星星' : '本地龘字体验证'}}{4/4}\nN: 1 2 3 4 |||\nL: 春天来了`, createdAt: '2026-11-19T00:00:00Z', expiresAt: null },
    ]))
  }, covered)
  const fonts: string[] = []
  page.on('request', request => { if (/\.(?:otf|ttf|woff2?)(?:$|\?)/.test(request.url())) fonts.push(request.url()) })
  await page.goto('/scores/local-font-test')
  await expect(page.locator('.score-paper svg').first()).toHaveAttribute('width', '560')
  await expect(page.locator('.score-paper')).not.toHaveAttribute('aria-busy', 'true')
  await page.getByRole('button', { name: '打印', exact: true }).click()
  const dialog = page.locator('.export-dialog')
  await expect(dialog.locator('.export-preview')).toHaveAttribute('aria-busy', 'false')
  expect(fonts.some(url => /NotoSansSC/.test(url))).toBe(true)
  const downloading = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'PDF', exact: true }).click()
  const download = await downloading
  const path = info.outputPath('local-font.pdf')
  await download.saveAs(path)
  const rows = execFileSync('pdffonts', [path], { encoding: 'utf8' })
  expect(rows).toMatch(/NotoSans.*yes\s+yes\s+yes/)
  expect(rows).not.toMatch(/Times|STSong|NotoSerif/)
  const text = execFileSync('pdftotext', [path, '-'], { encoding: 'utf8' })
  for (const char of '春天来了') expect(text).toContain(char)
  if (!covered) expect(text).toContain('龘')
})

for (const failure of ['download', 'parse']) test(`font ${failure} failure stops rendering until retry`, async ({ page }) => {
  await page.route(/NotoSansSC.*\.woff2$/, route => route.fulfill({ status: failure === 'download' ? 503 : 200, body: 'invalid font data' }))
  await page.goto('/scores/yue_ding_01')
  await expect(page.locator('.render-message')).toBeVisible()
  await expect(page.locator('.score-paper svg')).toHaveCount(0)
  await page.unroute(/NotoSansSC.*\.woff2$/)
  await page.reload()
  await expect(page.locator('.score-paper svg').first()).toBeVisible()
})
