import { expect, test, type Locator } from '@playwright/test'

async function selectionStart(editor: Locator) {
  return editor.evaluate(element => {
    const selection = window.getSelection()
    if (!selection?.rangeCount) return -1
    const range = selection.getRangeAt(0)
    const container = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement
    const line = container?.closest('.cm-line')
    const lines = [...element.querySelectorAll('.cm-line')]
    if (!line) return -1
    const before = document.createRange(); before.selectNodeContents(line); before.setEnd(range.startContainer, range.startOffset)
    return lines.slice(0, lines.indexOf(line)).reduce((total, item) => total + (item.textContent?.length ?? 0) + 1, 0) + before.toString().length
  })
}

const source = '{title=Browser Test}\n{key=C} {4/4} {120qpm}\nN: 1 2 3 4 |||'

test('edits, renders, and maps a score note back to source', async ({ page }) => {
  await page.goto('/editor')
  const editor = page.getByLabel('M3N source')
  await editor.fill(source)

  const paper = page.locator('.score-paper')
  await expect(paper).toContainText('Browser Test', { timeout: 30_000 })
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  const firstNote = page.locator('.score-paper [id^="m3n-e-"]').first()
  await expect(firstNote).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.score-paper .is-cursor-active-measure')).toHaveCount(1)
  await expect(paper.locator('.is-cursor-active-measure .measure-cursor-highlight')).toBeVisible()
  await firstNote.locator('use, path').first().click()
  await expect.poll(() => selectionStart(editor)).toBe(source.indexOf('1 2'))
})

test('exposes playback without a print action', async ({ page }) => {
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill(source)
  const play = page.getByRole('button', { name: '播放' })
  await expect(play).toBeVisible({ timeout: 30_000 })
  await play.click()
  await expect(page.getByRole('button', { name: '暂停' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: '暂停' }).click()

  await expect(page.getByRole('button', { name: '打印' })).toHaveCount(0)
})

test('highlights numbered notation during playback with tuplets and a bass voice', async ({ page }) => {
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill('{4/4}\nN: [123:2] 4 5 | 6 7 1e 2e |||\nL: 春夏秋冬天\nB: 1 2 3 4 | 5 6 7 1e |||')
  await page.getByRole('radio', { name: '简谱', exact: true }).check()
  const play = page.getByRole('button', { name: '播放' })
  await expect(play).toBeVisible({ timeout: 30_000 })
  await play.click()
  await expect(page.locator('.score-paper [data-m3n-id="m3n-e-1"].is-playing').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.score-paper text[data-m3n-id="m3n-e-1"].is-playing').first()).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: '暂停' }).click()
})

test('keeps reading width and print width independent', async ({ page }) => {
  await page.goto('/scores/huan_le_song_01')
  await expect(page.locator('.score-paper')).toHaveAttribute('data-render-mode', 'paged')
  await expect(page.locator('.score-page-sheet').first()).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: '练习设置', exact: true }).click()
  await expect(page.getByRole('slider', { name: '播放速度' })).toBeVisible()
  await page.getByRole('button', { name: '排版设置' }).click()
  const settings = page.getByRole('dialog')
  await expect(settings).toBeVisible()
  const pagedSwitch = settings.getByRole('switch', { name: '分页' })
  await expect(pagedSwitch).toBeChecked()
  const width = settings.getByRole('slider', { name: '乐谱宽度' })
  await expect(width).toHaveValue('800')
  await width.fill('600')
  await expect(width).toHaveValue('600')
  await expect(settings.locator('output').first()).toHaveText('600px')
  await pagedSwitch.uncheck()
  await expect(pagedSwitch).not.toBeChecked()
  await expect(page.locator('.score-paper')).toHaveAttribute('data-render-mode', 'continuous')
  await expect(page.locator('.score-page-sheet')).toHaveCount(0, { timeout: 30_000 })
  await page.getByRole('button', { name: '关闭' }).click()
  await expect(settings).not.toBeVisible()

  await page.getByRole('button', { name: '打印' }).click()
  const exportDialog = page.getByRole('dialog')
  await expect(exportDialog).toBeVisible()
  await expect(exportDialog.getByRole('spinbutton', { name: '打印宽度' })).toHaveValue('800')
  await exportDialog.getByRole('spinbutton', { name: '打印宽度' }).fill('700')
  await expect(page.locator('.renderer-settings-row output')).toHaveText('600px')
  await expect(exportDialog.locator('svg').first()).toBeVisible({ timeout: 30_000 })
  await expect(exportDialog.getByRole('radio', { name: 'PDF（A4 分页）' })).toBeChecked()
  await expect(exportDialog.locator('.export-preview-page').first()).toBeVisible({ timeout: 30_000 })
})

test('renders ScoreDocument through the vendored jpFun engine', async ({ page }) => {
  await page.goto('/scores/huan_le_song_01')
  await expect(page.getByRole('button', { name: '排版设置' })).toBeVisible({ timeout: 30_000 })
  const numbered = page.getByRole('radio', { name: '简谱', exact: true })
  await expect(numbered).toBeEnabled()
  await expect(numbered).not.toBeChecked()
  await numbered.check()
  await expect(numbered).toBeChecked()
  await expect(page.locator('.score-paper')).toHaveAttribute('data-notation', 'numbered')
  await expect(page.locator('.score-paper svg[viewBox^="0 0"]').first()).toBeVisible()
  await expect(page.locator('.score-paper [data-m3n-id^="m3n-e-"]').first()).toBeVisible()
})

test('switches every embedded documentation score between staff and numbered notation', async ({ page }) => {
  await page.goto('/docs?doc=guide')
  const renderedScores = page.locator('.embedded-editor .score-paper')
  await expect(renderedScores.first()).toHaveAttribute('data-notation', 'staff', { timeout: 30_000 })
  expect(await renderedScores.count()).toBeGreaterThan(1)

  const notationSwitch = page.getByRole('switch', { name: '简谱渲染' })
  await notationSwitch.check()
  await expect(renderedScores).toHaveCount(await renderedScores.count())
  await expect.poll(() => renderedScores.evaluateAll((scores) => scores.map((score) => score.dataset.notation))).toEqual(
    Array(await renderedScores.count()).fill('numbered'),
  )
})

test('renders numbered scores and their embedded fonts without loading Verovio', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('m3n:numbered-notation', '1'))
  const engineRequests: string[] = []
  await page.route(url => /verovio|\.wasm$/.test(url.pathname), route => {
    engineRequests.push(route.request().url())
    return route.abort()
  })
  await page.goto('/scores/tong_hua_zhen_01')
  await expect(page.locator('.score-paper svg[data-engine="jpfun"]').first()).toBeVisible()
  await expect(page.getByRole('button', { name: '播放' })).toBeEnabled()
  expect(await page.evaluate(() => document.fonts.check('22px "M3N Numbers"'))).toBe(true)
  expect(await page.locator('.score-paper svg').first().innerHTML()).toContain('data:font/ttf;base64,')
  expect(engineRequests).toEqual([])
})

test('maps numbered notes and lyrics to source and highlights the repeated verse', async ({ page }) => {
  await page.goto('/editor')
  const editor = page.getByLabel('M3N source')
  const text = '{2/4} {120qpm}\nN: ||: 1 2 | 3 4 :|||\nL1: 春天来了\nL2: 花开满园'
  await editor.fill(text)
  await page.getByRole('radio', { name: '简谱', exact: true }).check()
  await expect(page.locator('.score-paper svg[data-engine="jpfun"]').first()).toBeVisible()
  const note = page.locator('.score-paper #m3n-e-2 text')
  await expect(note).toBeVisible()
  await note.click()
  await expect.poll(() => selectionStart(editor)).toBe(text.indexOf('1 2') + 2)
  await page.locator('.score-paper text[data-m3n-role="lyric"][data-m3n-id="m3n-e-1"]').first().click()
  await expect.poll(() => selectionStart(editor)).toBe(text.indexOf('1 2'))
  await page.getByRole('button', { name: '播放' }).click()
  await expect(page.locator('.score-paper text[data-m3n-rendition="2"].is-playing').first()).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: '暂停' }).click()
})

test('orders numbered annotations above music and maps their clicks back to the source event', async ({ page }) => {
  await page.goto('/editor')
  const editor = page.getByLabel('M3N source')
  const text = '{4/4}\n===训练\nN: {text=练习说明} {cresc}1{tr} 2 3 4{/} |||'
  await editor.fill(text)
  await page.getByRole('radio', { name: '简谱', exact: true }).check()
  const annotations = page.locator('.score-paper text[data-m3n-role="annotation"]')
  await expect(annotations).toHaveCount(2)
  const section = annotations.filter({ hasText: '训练' })
  const instruction = annotations.filter({ hasText: '练习说明' })
  const sectionBox = (await section.boundingBox())!, instructionBox = (await instruction.boundingBox())!
  expect(sectionBox.y + sectionBox.height).toBeLessThan(instructionBox.y)
  await instruction.click()
  await expect.poll(() => selectionStart(editor)).toBe(text.indexOf('1{tr}'))
})

test('uses the numbered layout for export and honors excluding bass in SVG, PNG and PDF', async ({ page }, testInfo) => {
  const { readFile } = await import('node:fs/promises')
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill('{title=导出验证} {2/4}\nN: 1 2 | 3 4 |||\nL: 春天来了\nB: 1d 2d | 3d 4d |||')
  await page.getByRole('button', { name: '保存并预览' }).click()
  await page.getByRole('radio', { name: '简谱', exact: true }).check()
  await expect(page.locator('.score-paper svg[data-engine="jpfun"]')).toBeVisible()
  for (const [format, signature] of [['SVG 矢量图（连续）', '<svg'], ['PNG 图片（连续）', 'PNG'], ['PDF（A4 分页）', '%PDF']] as const) {
    await page.getByRole('button', { name: '打印' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('radio', { name: format, exact: true }).check()
    await dialog.getByRole('checkbox', { name: '包含低音谱表' }).uncheck()
    await expect(dialog.locator('svg[data-engine="jpfun"]').first()).toBeVisible()
    await expect(dialog.locator('[data-m3n-id="m3n-e-3"]')).toHaveCount(0)
    await expect(dialog.locator('[data-m3n-id="m3n-e-5"]').first()).toBeVisible()
    const download = page.waitForEvent('download')
    await dialog.getByRole('button', { name: '确认并下载' }).click()
    const downloaded = await download
    const path = testInfo.outputPath(downloaded.suggestedFilename())
    await downloaded.saveAs(path)
    const bytes = await readFile(path)
    expect(bytes.length).toBeGreaterThan(1000)
    expect(bytes.subarray(0, 80).toString()).toContain(signature)
    if (format.startsWith('SVG')) {
      expect(bytes.toString()).toContain('data:font/ttf;base64,')
      expect(bytes.toString()).not.toContain('data-m3n-id="m3n-e-3"')
    }
  }
})
