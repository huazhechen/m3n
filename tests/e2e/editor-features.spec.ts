import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import { test, expect } from '@playwright/test'
import { openScoreSettings } from './score-settings'
import { waitForEditor } from './editor-state'

test('editor provides highlighting, completions, diagnostic navigation and keyboard resizing', async ({ page }, info) => {
  await page.goto('/editor')
  await waitForEditor(page)
  const editor = page.getByRole('textbox', { name: 'M3N source', exact: true })
  await editor.fill('{4/4}\nN: 1 2 3 4 5 |||')
  await expect(page.locator('.cm-gutter.cm-lineNumbers')).toBeVisible()
  await expect(page.locator('.cm-content span').first()).toBeVisible()
  const diagnostic = page.locator('.diagnostic-link').filter({ hasText: '超出' }).first()
  await expect(diagnostic).toBeVisible()
  await diagnostic.click()
  await expect(editor).toBeFocused()
  const split = page.getByRole('separator', { name: '调整源码与预览宽度' })
  await split.focus(); await split.press('ArrowRight')
  await expect(split).toHaveAttribute('aria-valuenow', '55')
  await waitForEditor(page)
  await editor.fill('{key=C}{4/4}\nN: 1 2 3 4 |||')
  await waitForEditor(page)
  await editor.press('Control+Home')
  for (let index = 0; index < 4; index++) await editor.press('ArrowRight')
  await editor.press('Control+Space')
  await expect(page.getByRole('listbox')).toBeVisible()
  await expect(page.getByRole('option', { name: 'key=C', exact: true })).toBeVisible()
  await editor.fill('{4/4}\nN: (1 2) 3 4 5 |||')
  await waitForEditor(page)
  await editor.press('Home')
  for (let index = 0; index < 4; index++) await editor.press('ArrowRight')
  await expect(page.locator('.cm-matchingBracket')).toHaveCount(2)
  await page.screenshot({ path: info.outputPath('editor-desktop.png') })
})

test('mobile editor switches panes without losing input; catalog fills and filters the viewport', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/editor')
  await waitForEditor(page)
  const editor = page.getByRole('textbox', { name: 'M3N source', exact: true })
  await editor.fill('{title=手机试改}{4/4}\nN: 1 2 3 4 |||')
  await page.getByRole('tab', { name: '预览', exact: true }).click()
  await expect(page.locator('.score-paper')).toContainText('手机试改')
  await expect(editor).not.toBeVisible()
  await expect(page.locator('.score-paper svg').first()).toBeVisible()
  await expect(page.locator('.score-paper')).not.toHaveAttribute('aria-busy', 'true')
  await expect(async () => {
    const bounds = await page.locator('.score-paper svg').first().boundingBox()
    expect(bounds?.width).toBeGreaterThan(290)
    expect(bounds?.width).toBeLessThan(390)
  }).toPass()
  await page.screenshot({ path: info.outputPath('editor-mobile.png') })
  await page.getByRole('tab', { name: '源码', exact: true }).click()
  await expect(editor).toHaveText('{title=手机试改}{4/4}\nN: 1 2 3 4 |||', { useInnerText: true })
  await page.goto('/scores')
  await expect(page.getByRole('navigation', { name: '最近编辑' })).toHaveCount(0)
  const card = page.locator('.score-list .score-card').first()
  expect((await card.boundingBox())!.width).toBeGreaterThan(320)
  await page.getByRole('searchbox', { name: '搜索乐谱' }).fill('本地')
  await expect(page.locator('.score-list .score-card')).toHaveCount(0)
  await page.getByRole('searchbox', { name: '搜索乐谱' }).fill('内置 6/8')
  await expect(page.locator('.score-list .score-card').first()).toContainText('6/8')
  await expect(page.getByRole('button', { name: '紧凑列表' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('library-mobile.png') })
})

test('multipage PDF downloads with the same pages in continuous and paged modes', async ({ page }, info) => {
  test.setTimeout(90_000)
  await page.addInitScript(() => localStorage.setItem('m3n:render-mode', 'continuous'))
  await page.goto('/editor')
  await waitForEditor(page)
  await page.getByRole('textbox', { name: 'M3N source' }).fill(`{title=中文矢量验证}{4/4}\nN: ${Array.from({ length: 16 }, () => '1 2 3 4 |').join(' {br} ')}||\nL: ${'春天来了'.repeat(16)}`)
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/\/scores\/local-/)
  await expect(page.locator('.score-paper [data-m3n-id="m3n-e-64"]').first()).toBeAttached()
  let expectedPages = 0
  for (const paged of [false, true]) {
    await openScoreSettings(page)
    await page.getByRole('slider', { name: '乐谱宽度' }).fill('25')
    await openScoreSettings(page)
    const pagination = page.getByRole('switch', { name: '分页', exact: true })
    if (await pagination.isChecked() !== paged) await pagination.click()
    await page.keyboard.press('Escape')
    await expect(page.locator('.score-paper')).toHaveAttribute('data-render-mode', paged ? 'paged' : 'continuous')
    await waitForEditor(page)
    await page.getByRole('button', { name: '打印', exact: true }).click()
    const dialog = page.locator('.export-dialog')
    // A newly opened dialog briefly starts with aria-busy=false before its
    // effect begins. Wait for real preview content before reading pagination.
    await expect(dialog.locator('[data-m3n-id="m3n-e-64"]').first()).toBeAttached()
    await expect(dialog.locator('.export-preview')).toHaveAttribute('aria-busy', 'false')
    await expect(dialog.locator('.export-preview-page')).toHaveCount(paged ? expectedPages : 0)
    const started = Date.now()
    const downloading = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'PDF', exact: true }).click()
    const download = await downloading
    await info.attach(`pdf-download-ms-${paged}`, { body: String(Date.now() - started), contentType: 'text/plain' })
    const path = info.outputPath(`system-fonts-${paged}.pdf`)
    await download.saveAs(path)
    const pdf = await PDFDocument.load(await readFile(path))
    const count = pdf.getPageCount()
    expect(count).toBeGreaterThan(1)
    if (paged) expect(count).toBe(expectedPages)
    expectedPages = count
    for (const sheet of pdf.getPages()) {
      expect(sheet.getWidth()).toBeCloseTo(210 * 72 / 25.4)
      expect(sheet.getHeight()).toBeCloseTo(297 * 72 / 25.4)
    }
  }
})


test('mobile PNG and PDF reuse the same score fonts', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => { window.print = () => { throw new Error('Printing is unavailable on this device') } })
  const fontRequests: string[] = []
  await page.route(/\.(?:otf|ttf|woff2?)(?:[?#]|$)/i, route => {
    fontRequests.push(route.request().url())
    return route.continue()
  })
  await page.goto('/editor')
  await waitForEditor(page)
  await page.getByRole('textbox', { name: 'M3N source' }).fill('{title=手机保存导出}{4/4}\nN: 1 2 3 4 |||\nL: 春天来了')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/\/scores\/local-/)
  for (const format of ['PNG', 'PDF']) {
    await page.getByRole('button', { name: '打印', exact: true }).click()
    const dialog = page.locator('.export-dialog')
    await expect(dialog.locator('.export-preview')).toHaveAttribute('aria-busy', 'false')
    const started = Date.now()
    const downloading = page.waitForEvent('download')
    await dialog.getByRole('button', { name: format, exact: true }).click()
    const download = await downloading
    await info.attach(`mobile-${format}-ms`, { body: String(Date.now() - started), contentType: 'text/plain' })
    const path = info.outputPath(`手机保存导出.${format.toLowerCase()}`)
    await download.saveAs(path)
    if (format === 'PDF') {
      expect((await PDFDocument.load(await readFile(path))).getPageCount()).toBe(1)
      expect(fontRequests.some(url => /NotoSansSC/.test(url))).toBe(true)
    } else {
      expect(fontRequests.some(url => /NotoSansSC/.test(url))).toBe(true)
    }
    await expect(dialog).not.toBeVisible()
  }
})
