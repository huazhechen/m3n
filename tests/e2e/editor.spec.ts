import { expect, test, type Locator } from '@playwright/test'
import { openScoreSettings, selectNotationMode } from './score-settings'

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
  await editor.press('ControlOrMeta+End')
  await expect(page.locator('.score-paper .is-cursor-active-measure')).toHaveCount(1)
  await expect(paper.locator('.is-cursor-active').first()).toBeVisible()
  await firstNote.locator('text').first().click()
  await expect.poll(() => selectionStart(editor)).toBe(source.indexOf('1 2'))
})

test('exposes playback without an export action', async ({ page }) => {
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill(source)
  const play = page.getByRole('button', { name: '播放', exact: true })
  await expect(play).toBeVisible({ timeout: 30_000 })
  await play.click()
  await expect(page.getByRole('button', { name: '暂停' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: '暂停' }).click()

  await expect(page.getByRole('button', { name: '打印' })).toHaveCount(0)
})

test('renders tied full beats as sustain dashes and maps a dash click to its measure start', async ({ page }) => {
  const source = '{title=Sustain Test}{4/4}\nN: 6~ 6~ 6~ 6 |||\nL: 白'
  await page.goto('/editor')
  const editor = page.getByLabel('M3N source')
  await editor.fill(source)
  const paper = page.locator('.score-paper')
  await expect(paper).toContainText('Sustain Test', { timeout: 30_000 })
  await expect(paper.locator('g.note[data-m3n-role="sustain"]')).toHaveCount(3)
  await expect(paper.locator('g.note text')).toHaveText(['6'])
  await expect(paper.locator('text[data-m3n-role="lyric"]')).toHaveText(['白'])
  const dash = paper.locator('#m3n-e-2')
  await expect(dash.locator('text')).toHaveCount(0)
  // A horizontal SVG line has a zero-height bounding box. Click its painted
  // stroke with the real mouse instead of Playwright's box visibility check.
  const point = await dash.locator('line').evaluate(line => {
    const box = line.getBoundingClientRect()
    return { x: box.x + box.width / 2, y: box.y }
  })
  await page.mouse.click(point.x, point.y)
  await expect.poll(() => selectionStart(editor)).toBe(source.indexOf('6~'))
})

test('highlights numbered notation during playback with tuplets and a bass voice', async ({ page }) => {
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill('{4/4}\nN: [123:2] 4 5 | 6 7 1e 2e |||\nL: 春夏秋冬天 | 山川天地\nB: 1 2 3 4 | 5 6 7 1e |')
  const play = page.getByRole('button', { name: '播放', exact: true })
  await expect(play).toBeVisible({ timeout: 30_000 })
  await play.click()
  await expect(page.locator('.score-paper [data-m3n-id="m3n-e-1"].is-playing').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.score-paper text[data-m3n-id="m3n-e-1"].is-playing').first()).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: '暂停' }).click()
})

test('export preview reuses current display settings and offers PNG and PDF', async ({ page }) => {
  await page.goto('/scores/huan_le_song_01')
  await openScoreSettings(page)
  await page.getByRole('slider', { name: '乐谱宽度' }).fill('600')
  await openScoreSettings(page)
  await page.getByRole('slider', { name: '播放速度', exact: true }).fill('137')
  await openScoreSettings(page)
  await selectNotationMode(page, '固定调')
  for (const name of ['小节号', '分页']) await page.getByRole('switch', { name, exact: true }).click()
  await openScoreSettings(page)
  await page.getByRole('button', { name: /^移调，当前/ }).click()
  await page.getByRole('dialog', { name: '选择调性' }).getByRole('button', { name: 'D大调', exact: true }).click()
  const paper = page.locator('.score-paper')
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  await page.getByRole('button', { name: '打印', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('.export-preview')).toHaveAttribute('aria-busy', 'false')
  await expect(dialog.locator('input,select')).toHaveCount(0)
  await expect(dialog.getByRole('group', { name: '导出格式' }).getByRole('button')).toHaveText(['PNG', 'PDF'])
  await expect(dialog.locator('svg[data-engine="m3n"]').first()).toHaveAttribute('width', '600')
  // The continuous export frame also carries the source URL below the score.
  expect(await dialog.locator('svg[data-engine="m3n"] text').allTextContents()).toEqual(await paper.locator('svg text').allTextContents())
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    const rects = await dialog.locator('.export-actions button').evaluateAll(buttons => buttons.map(button => { const r = button.getBoundingClientRect(); return { y: r.y, left: r.left, right: r.right } }))
    expect(new Set(rects.map(r => r.y)).size).toBe(1)
    expect(rects.every(r => r.left >= 0 && r.right <= width)).toBe(true)
  }
})

test('renders ScoreDocument through the native numbered engine', async ({ page }) => {
  await page.goto('/scores/huan_le_song_01')
  await openScoreSettings(page)
  await expect(page.getByRole('slider', { name: '乐谱宽度' })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.score-paper')).toHaveAttribute('data-notation', 'numbered')
  await expect(page.locator('.score-paper svg[viewBox^="0 0"]').first()).toBeVisible()
  await expect(page.locator('.score-paper [data-m3n-id^="m3n-e-"]').first()).toBeVisible()
})

test('all embedded documentation scores use numbered notation', async ({ page }) => {
  await page.goto('/?doc=guide')
  const papers=page.locator('.embedded-editor .score-paper')
  await expect(papers.first()).toHaveAttribute('data-notation','numbered')
  expect(await papers.count()).toBeGreaterThan(1)
  await expect(page.getByRole('switch',{name:'简谱渲染'})).toHaveCount(0)
})

test('renders numbered scores and their embedded fonts without loading the staff engine', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('m3n:numbered-notation', '1'))
  const engineRequests: string[] = []
  await page.route(url => /\/(?:staff-score|vexflow)[^/]*\.js$|\.wasm$/.test(url.pathname), route => {
    engineRequests.push(route.request().url())
    return route.abort()
  })
  await page.goto('/scores/tong_hua_zhen_01')
  await expect(page.locator('.score-paper svg[data-engine="m3n"]').first()).toBeVisible()
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeEnabled()
  expect(await page.evaluate(() => document.fonts.check('22px "M3N Numbers"'))).toBe(true)
  expect(await page.locator('.score-paper svg').first().innerHTML()).toContain('data:font/ttf;base64,')
  expect(engineRequests).toEqual([])
})

test('maps numbered notes and lyrics to source and highlights the repeated verse', async ({ page }) => {
  await page.goto('/editor')
  const editor = page.getByLabel('M3N source')
  const text = '{2/4} {120qpm}\nN: ||: 1 2 | 3 4 :|||\nL1: 春天来了\nL2: 花开满园'
  await editor.fill(text)
  await expect(page.locator('.score-paper svg[data-engine="m3n"]').first()).toBeVisible()
  const note = page.locator('.score-paper #m3n-e-2 text')
  await expect(note).toBeVisible()
  await expect(page.locator('.score-paper')).not.toHaveAttribute('aria-busy','true')
  await note.click()
  await expect.poll(() => selectionStart(editor)).toBe(text.indexOf('1 2'))
  await page.locator('.score-paper text[data-m3n-role="lyric"][data-m3n-id="m3n-e-1"]').first().click()
  await expect.poll(() => selectionStart(editor)).toBe(text.indexOf('1 2'))
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await expect(page.locator('.score-paper text[data-m3n-rendition="2"].is-playing').first()).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: '暂停' }).click()
})

test('orders numbered annotations above music and maps their clicks back to the source event', async ({ page }) => {
  await page.goto('/editor')
  const editor = page.getByLabel('M3N source')
  const text = '{4/4}\n===训练{br}\nN: {text=练习说明} {cresc}1{tr} 2 3 4{/} |||'
  await editor.fill(text)
  const annotations = page.locator('.score-paper text[data-m3n-role="annotation"]')
  await expect(annotations).toHaveCount(2)
  const section = annotations.filter({ hasText: '训练' })
  const instruction = annotations.filter({ hasText: '练习说明' })
  await expect(async () => {
    const sectionBox = await section.boundingBox(), instructionBox = await instruction.boundingBox()
    expect(sectionBox).not.toBeNull()
    expect(instructionBox).not.toBeNull()
    expect(sectionBox!.y + sectionBox!.height).toBeLessThan(instructionBox!.y)
  }).toPass()
  await instruction.click()
  await expect.poll(() => selectionStart(editor)).toBe(text.indexOf('1{tr}'))
})

test('uses the current numbered layout and includes visible bass in PNG and PDF', async ({ page }, testInfo) => {
  const { readFile } = await import('node:fs/promises')
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill('{title=导出验证} {2/4}\nN: 1 2 | 3 4 |||\nL: 春天来了\nB: 1d 2d | 3d 4d |||')
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.locator('.score-paper svg[data-engine="m3n"]')).toBeVisible()
  for (const [format, signature] of [['PNG', 'PNG'], ['PDF', '%PDF']] as const) {
    await page.getByRole('button', { name: '打印' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('svg[data-engine="m3n"]').first()).toBeVisible()
    await expect(dialog.locator('[data-m3n-id="m3n-e-3"]').first()).toBeVisible()
    await expect(dialog.locator('[data-m3n-id="m3n-e-5"]').first()).toBeVisible()
    const download = page.waitForEvent('download')
    await dialog.getByRole('button', { name: format }).click()
    const downloaded = await download
    const path = testInfo.outputPath(downloaded.suggestedFilename())
    await downloaded.saveAs(path)
    const bytes = await readFile(path)
    expect(bytes.length).toBeGreaterThan(1000)
    expect(bytes.subarray(0, 80).toString()).toContain(signature)
  }
})

test('playback highlights notes without forcing page or source scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill(`{title=播放滚动验证}{4/4}{240qpm}\n${Array(48).fill('N: 1 2 3 4 |').join('\n---\n')}`)
  await expect(page.locator('.score-paper')).toContainText('播放滚动验证')
  await expect(page.locator('.score-paper')).not.toHaveAttribute('aria-busy', 'true')
  await page.getByRole('button', { name: '播放', exact: true }).click()
  const pause = page.getByRole('button', { name: '暂停', exact: true })
  await expect(pause).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.score-paper .is-playing').first()).toBeVisible()
  const position = page.locator('.playback-progress input[aria-hidden="true"]')
  const before = Number(await position.inputValue())
  const initial = await page.evaluate(() => {
    window.scrollTo(0, 0)
    const scroller = document.querySelector<HTMLElement>('.cm-scroller')!
    scroller.scrollTop = 200
    return { page: scrollY, source: scroller.scrollTop }
  })
  expect(initial.source).toBeGreaterThan(0)
  await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(before + 25)
  expect(await page.evaluate(() => ({ page: scrollY, source: document.querySelector('.cm-scroller')!.scrollTop }))).toEqual(initial)
  await expect(pause).toBeInViewport()
  await pause.click()
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeEnabled()
})

for (const mode of ['首调', '固定调', '五线谱'] as const) {
  test(`clicks anywhere in a measure seek and edit at its start in ${mode}`, async ({ page }) => {
    await page.goto('/editor')
    const editor = page.getByLabel('M3N source')
    const text = '{4/4}{60qpm}\nN: 1 2 3 4 | 0 5 6 7 | 1 2 3 4 |||\nL: 春天来了 花开满园 春天来了'
    await editor.fill(text)
    await selectNotationMode(page, mode)
    await page.keyboard.press('Escape')
    const paper = page.locator('.score-paper')
    await expect(paper).not.toHaveAttribute('aria-busy', 'true')
    const measure = paper.locator('g.measure').nth(1)
    const last = measure.locator('g.note, g.rest').last()
    const clickLast = async () => {
      await last.scrollIntoViewIfNeeded()
      const bounds = (await last.boundingBox())!
      await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    }
    await clickLast()
    await expect.poll(() => selectionStart(editor)).toBe(text.indexOf('0 5'))
    const area = measure.locator(':scope > .measure-click-area')
    const box = (await area.boundingBox())!
    // The corner is blank score space, away from any note or lyric.
    await page.mouse.click(box.x + box.width - 3, box.y + box.height - 3)
    await expect.poll(() => selectionStart(editor)).toBe(text.indexOf('0 5'))
    const metro = page.getByRole('switch', { name: '节拍器', exact: true })
    if (await metro.isChecked()) await metro.click()
    await page.getByRole('button', { name: '播放', exact: true }).click()
    await expect(paper.locator('.is-playing').first()).toBeVisible()
    await clickLast()
    // The measure begins with a rest. Clicking its final note must land on it.
    await expect(measure.locator('g.note, g.rest').first()).toHaveClass(/is-playing/)
    await page.mouse.click(box.x + box.width - 3, box.y + box.height - 3)
    await expect(measure.locator('g.note, g.rest').first()).toHaveClass(/is-playing/)
    await page.getByRole('button', { name: '暂停', exact: true }).click()
  })
}
