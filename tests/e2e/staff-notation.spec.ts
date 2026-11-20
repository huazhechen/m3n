import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { PDFDocument, PDFDict, PDFName } from 'pdf-lib'
import { openScoreSettings, selectNotationMode } from './score-settings'
import { staffInkBounds } from '../../tools/lib/staff-ink-collisions.mjs'

test('staff mode uses its own preferred width, locates source, highlights playback and keeps playback alive across modes and transposition', async ({ page }, info) => {
  const wasm: string[] = []
  page.on('request', request => { if (request.url().includes('.wasm')) wasm.push(request.url()) })
  await page.goto('/editor')
  const source = '{preferred-width=540}{staff-preferred-width=613}{title=五线谱验证}{key=D}{4/4}{60qpm}\nN: [123:2] 4 5 | [135:h] 6 7 1e | 1e 7 6 5 |||\nL: 春夏秋冬天 | 山川天地 | 明月清风\nB: 1d 2d 3d 4d | 5d 6d 7d 1 | 1 7d 6d 5d |'
  await page.getByLabel('M3N source').fill(source)
  const paper = page.locator('.score-paper')
  await expect(paper.locator('svg[data-engine="m3n"]').first()).toBeVisible()
  expect(wasm).toHaveLength(0)
  await openScoreSettings(page)
  await expect(page.getByRole('slider', { name: '乐谱宽度' })).toHaveValue('540')
  await selectNotationMode(page, '五线谱')
  await expect(paper).toHaveAttribute('data-notation', 'staff')
  await expect(paper.locator('g.staff').first()).toBeVisible()
  await expect(paper.locator('svg svg, use, polygon, polyline, ellipse')).toHaveCount(0)
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  await expect(paper.locator(':scope > .score-page-sheet > svg, :scope > svg').first()).toHaveAttribute('width', '613')
  expect(wasm).toHaveLength(1)
  await page.keyboard.press('Escape')
  await paper.locator('[id="m3n-e-2"] .notehead').first().click()
  await expect.poll(() => page.getByLabel('M3N source').evaluate(element => {
    const selection = window.getSelection()
    if (!selection?.rangeCount) return -1
    const range = selection.getRangeAt(0)
    const container = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement
    const line = container?.closest('.cm-line')
    const lines = [...element.querySelectorAll('.cm-line')]
    if (!line) return -1
    const before = document.createRange(); before.selectNodeContents(line); before.setEnd(range.startContainer, range.startOffset)
    return lines.slice(0, lines.indexOf(line)).reduce((total, item) => total + (item.textContent?.length ?? 0) + 1, 0) + before.toString().length
  })).toBe(source.indexOf('4 5'))
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(paper.locator('g.note.is-playing, g.tuplet.is-playing, g.chord.is-playing').first()).toBeVisible({ timeout: 15_000 })
  const originalNote = await paper.locator('[id="m3n-e-2"] .notehead').innerHTML()
  await openScoreSettings(page)
  await page.getByRole('button', { name: /^移调，当前/ }).click()
  await page.getByRole('dialog', { name: '选择调性' }).getByRole('button', { name: 'E大调', exact: true }).click()
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  expect(await paper.locator('[id="m3n-e-2"] .notehead').innerHTML()).not.toEqual(originalNote)
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  await selectNotationMode(page, '固定调')
  await expect(paper).toHaveAttribute('data-fixed-do', 'true')
  await expect(page.getByRole('slider', { name: '乐谱宽度' })).toHaveValue('540')
  await expect(paper.locator('svg[data-engine="m3n"]').first()).toBeVisible()
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  await selectNotationMode(page, '首调')
  await expect(paper).toHaveAttribute('data-fixed-do', 'false')
  await selectNotationMode(page, '五线谱')
  await expect(paper.locator('g.staff').first()).toBeVisible()
  expect(wasm).toHaveLength(1)
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await page.keyboard.press('Escape')
  await paper.screenshot({ path: info.outputPath('staff.png') })
  await page.reload()
  await expect(paper).toHaveAttribute('data-notation', 'staff')
  await expect(paper.locator('g.staff').first()).toBeVisible()
})

test('staff pagination, tempo and transposition are shared by screen, PNG and vector PDF exports', async ({ page }, info) => {
  test.setTimeout(120_000)
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill('{title=五线谱导出}{preferred-width=540}{staff-preferred-width=540}{key=G}{4/4}{90qpm}\nN: ' + Array.from({ length: 64 }, (_, index) => index === 0 ? '{cresc}[135:h]. 2_ 3 4{/}' : '1 2 3 4').join(' | ') + ' |||\nB: ' + Array.from({ length: 64 }, () => '1d 2d 3d 4d').join(' | ') + ' |')
  await selectNotationMode(page, '五线谱')
  await openScoreSettings(page)
  await page.getByRole('slider', { name: '乐谱宽度' }).fill('540')
  await page.getByRole('slider', { name: '播放速度', exact: true }).fill('137')
  const paper = page.locator('.score-paper')
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  const pageCount = await paper.locator('.score-page-sheet').count()
  expect(pageCount).toBeGreaterThan(1)
  await page.getByRole('switch', { name: '分页', exact: true }).click()
  await expect(paper).toHaveAttribute('data-render-mode', 'continuous')
  await expect(paper.locator(':scope > svg')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  for (const format of ['PNG', 'PDF']) {
    await page.getByRole('button', { name: '打印', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '导出乐谱', exact: true })
    await expect(dialog.locator('.export-preview')).toHaveAttribute('aria-busy', 'false')
    await expect(dialog.locator('g.staff').first()).toBeVisible()
    const downloading = page.waitForEvent('download')
    await dialog.getByRole('button', { name: format, exact: true }).click()
    const download = await downloading
    const path = info.outputPath(download.suggestedFilename())
    await download.saveAs(path)
    const bytes = await readFile(path)
    expect(bytes.length).toBeGreaterThan(1000)
    if (format === 'PDF') {
      expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
      const pdf = await PDFDocument.load(bytes)
      expect(pdf.getPageCount()).toBe(pageCount)
      expect(pdf.context.enumerateIndirectObjects().some(([, object]) => object instanceof PDFDict && object.get(PDFName.of('Subtype')) === PDFName.of('Image'))).toBe(false)
    } else expect(bytes.subarray(1, 4).toString()).toBe('PNG')
  }
})

test('keyed visits keep source clicks and highlight the performed staff occurrence', async ({ page }) => {
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill('{key=C}{4/4}{60qpm}{order=A,A@D5}\n===A\nN: 1 2 3 4 |||\nL1: 春夏秋冬\nL2: 山川天地')
  await selectNotationMode(page, '五线谱')
  const paper = page.locator('.score-paper')
  await expect(paper.locator('g.note[data-m3n-id="m3n-e-1"]')).toHaveCount(2)
  await expect(paper.locator('[id="m3n-e-1-rend2"]')).toHaveAttribute('data-m3n-passes', '2')
  await page.keyboard.press('Escape')
  await paper.locator('[id="m3n-e-1-rend2"] .notehead').click()
  await expect(paper.locator('[id="m3n-e-1"]')).toHaveClass(/is-cursor-active/)
  await openScoreSettings(page)
  const metronome = page.getByRole('switch', { name: '节拍器', exact: true })
  if (await metronome.isChecked()) await metronome.click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await expect(paper.locator('[id="m3n-e-1-rend2"].is-playing')).toBeVisible({ timeout: 12_000 })
  await expect(paper.locator('[id="m3n-e-1"]')).not.toHaveClass(/is-playing/)
  await page.getByRole('button', { name: '暂停', exact: true }).click()
})

test('a failed optional staff download leaves the notation selector available', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('m3n:notation-mode', 'staff'))
  await page.route('**/*.wasm', route => route.abort())
  await page.goto('/scores/huan_le_song_01')
  await expect(page.locator('.render-message')).toBeVisible()
  await selectNotationMode(page, '首调')
  await expect(page.locator('.score-paper svg[data-engine="m3n"]').first()).toBeVisible()
  await expect(page.locator('.render-message')).toHaveCount(0)
})

test('basic exercises keep section labels and Chinese directions inside staff pages', async ({ page }) => {
  const source = await readFile('src/scores/ban_yin_jie_kou_qin_ji_ben_gong_01.m3n', 'utf8')
  await page.goto('/editor')
  await page.addScriptTag({ content: staffInkBounds.toString() })
  await page.getByLabel('M3N source').fill(source)
  await selectNotationMode(page, '五线谱')
  await openScoreSettings(page)
  const paper = page.locator('.score-paper')
  for (const width of [540, 640, 720]) {
    await page.getByRole('slider', { name: '乐谱宽度' }).fill(String(width))
    const pages = paper.locator(':scope > .score-page-sheet > svg, :scope > svg')
    await expect(pages.first()).toHaveAttribute('width', String(width))
    await expect(paper).not.toHaveAttribute('aria-busy', 'true')
    const outside = await pages.evaluateAll(elements => elements.flatMap((element, index) => {
      const svg = element as SVGSVGElement, ink = (window as unknown as { staffInkBounds: (svg: SVGSVGElement) => DOMRect }).staffInkBounds(svg), box = svg.viewBox.baseVal
      const tolerance = box.width / Number(svg.getAttribute('width')) * 0.5
      return ink.x < -tolerance || ink.y < -tolerance || ink.x + ink.width > box.width + tolerance || ink.y + ink.height > box.height + tolerance ? [{ page: index + 1, ink: { x: ink.x, y: ink.y, width: ink.width, height: ink.height }, viewBox: { width: box.width, height: box.height } }] : []
    }))
    expect(outside, `${width}px staff pages`).toEqual([])
  }
})

test('staff measure numbers appear only at system ends in continuous and paged layouts', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('m3n:notation-mode', 'staff')
    localStorage.setItem('m3n:measure-numbers', '1')
  })
  await page.goto('/scores/ban_yin_jie_kou_qin_ji_ben_gong_01')
  const paper = page.locator('.score-paper')
  for (const paged of [true, false]) {
    if (!paged) {
      await openScoreSettings(page)
      await page.getByRole('switch', { name: '分页', exact: true }).click()
      await page.keyboard.press('Escape')
    }
    await expect(paper.locator('g.system').first()).toBeVisible({ timeout: 60_000 })
    await expect(paper).not.toHaveAttribute('aria-busy', 'true')
    const systems = await paper.locator('g.system').evaluateAll(systems => systems.map(system => {
      const measures = [...system.querySelectorAll('g.measure')]
      const numbers = [...system.querySelectorAll('g.mNum')]
      const number = numbers[0]
      const last = measures.at(-1)!
      const right = Math.max(...[...last.querySelectorAll('g.barLine path')].map(path => path.getBoundingClientRect().right))
      return { count: numbers.length, last: number?.closest('g.measure') === last,
        text: number?.textContent?.replace(/\s/g, ''), rightGap: right - (number?.getBoundingClientRect().right ?? 0) }
    }))
    expect(systems.length).toBeGreaterThan(1)
    for (const system of systems) {
      expect(system.count).toBe(1)
      expect(system.last).toBe(true)
      expect(system.text).toMatch(/^\d+$/)
      expect(Math.abs(system.rightGap)).toBeLessThan(2)
    }
  }
  await openScoreSettings(page)
  await page.getByRole('switch', { name: '小节号', exact: true }).click()
  await expect(paper.locator('g.mNum')).toHaveCount(0)
})
