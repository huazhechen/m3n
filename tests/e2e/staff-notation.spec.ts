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
  test.setTimeout(120_000)
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
    const headings = await paper.locator('g.system').evaluateAll(systems => systems.flatMap(system => {
      const heading = system.querySelector('g.reh')
      if (!heading) return []
      const directions = [...system.querySelectorAll('g.dir')]
      const tempos = [...system.querySelectorAll('g.tempo')]
      return [{
        label: heading.textContent,
        top: heading.getBoundingClientRect().top,
        bottom: heading.getBoundingClientRect().bottom,
        directionTop: Math.min(...directions.map(direction => direction.getBoundingClientRect().top)),
        tempoBottom: Math.max(...tempos.map(tempo => tempo.getBoundingClientRect().bottom)),
      }]
    }))
    expect(headings).toHaveLength(2)
    for (const heading of headings) {
      expect(heading.bottom, `${width}px ${heading.label} must precede directions`).toBeLessThan(heading.directionTop)
      expect(heading.tempoBottom, `${width}px tempo must precede ${heading.label}`).toBeLessThan(heading.top)
    }
    for (const measure of [15, 16, 17, 18]) {
      const hairpins = await paper.locator(`[id="m3n-measure-1-${measure}"] g.hairpin`).evaluateAll(nodes =>
        nodes.map(node => {
          const box = node.getBoundingClientRect()
          return { x: box.x, right: box.right, center: box.y + box.height / 2 }
        }))
      expect(hairpins).toHaveLength(2)
      expect(hairpins[1].x).toBeGreaterThan(hairpins[0].right)
      expect(Math.abs(hairpins[0].center - hairpins[1].center), `${width}px measure ${measure}`).toBeLessThan(0.1)
    }
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

test('ending brackets stay below row-end measure numbers in both notation modes', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('m3n:notation-mode', 'numbered')
    localStorage.setItem('m3n:measure-numbers', '1')
  })
  await page.goto('/scores/duo_lai_mi_01')
  const paper = page.locator('.score-paper')
  for (const mode of ['首调', '五线谱'] as const) {
    if (mode === '五线谱') await selectNotationMode(page, mode)
    await expect(paper).not.toHaveAttribute('aria-busy', 'true')
    await expect.poll(() => paper.locator('g.system').count()).toBeGreaterThan(0)
    const attached = await paper.locator('g.system').evaluateAll(systems => systems.flatMap(system => {
      const number = system.querySelector('g.mNum,[data-m3n-role="measure-number"]')
      const ending = system.querySelector('g.ending,[data-m3n-relation="volta"]')
      if (!number || !ending) return []
      return [{ numberBottom: number.getBoundingClientRect().bottom, endingTop: ending.getBoundingClientRect().top }]
    }))
    expect(attached.length).toBeGreaterThan(0)
    for (const { numberBottom, endingTop } of attached)
      expect(numberBottom, `${mode} row-end number above ending`).toBeLessThan(endingTop)
  }
})

test('staff volta hooks, separation, and music clearance stay correct', async ({ page }) => {
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill(await readFile('src/scores/besame_mucho_01.m3n', 'utf8'))
  await selectNotationMode(page, '五线谱')
  const paper = page.locator('.score-paper')
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  // Bravura changes the line breaks; the second ending now has the continuation.
  const continuedEnding = paper.locator('g.ending.id-m3n-ending-2')
  await expect(continuedEnding.locator('.m3n-ending-start-hook')).toHaveCount(1)

  await page.getByLabel('M3N source').fill(await readFile('src/scores/qian_si_xi_01.m3n', 'utf8'))
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  const brackets = await paper.locator('g.system').evaluateAll(systems => systems.flatMap(system => {
    const endings = [...system.querySelectorAll('g.ending.voltaBracket, g.ending .voltaBracket')]
      .filter(ending => ending.querySelectorAll('path').length >= 3)
    if (endings.length < 2) return []
    return endings.slice(0, 2).map(ending => {
      const horizontal = [...ending.querySelectorAll('path')].find(path => {
        const box = (path as SVGGraphicsElement).getBBox()
        return box.width > box.height * 4
      }) as SVGGraphicsElement
      const box = horizontal.getBBox(), matrix = horizontal.getCTM()!
      const left = new DOMPoint(box.x, box.y + box.height / 2).matrixTransform(matrix)
      const right = new DOMPoint(box.x + box.width, box.y + box.height / 2).matrixTransform(matrix)
      return { left: left.x, right: right.x, y: left.y }
    })
  }))
  expect(brackets.length).toBeGreaterThan(0)
  for (let index = 0; index < brackets.length; index += 2) {
    expect(Math.abs(brackets[index]!.y - brackets[index + 1]!.y)).toBeLessThan(0.1)
    expect(brackets[index + 1]!.left - brackets[index]!.right).toBeGreaterThanOrEqual(2)
  }

  await page.goto('/scores/fly_me_to_the_moon_01')
  await selectNotationMode(page, '五线谱')
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  const gaps = await paper.locator('g.system').evaluateAll(systems => systems.flatMap(system => {
    const ending = system.querySelector('g.ending.voltaBracket, g.ending .voltaBracket')
    const staff = system.querySelector('g.staff')
    if (!ending || !staff || !ending.querySelector('path')) return []
    const staffBox = staff.getBoundingClientRect()
    const lines = [...staff.querySelectorAll('path')].map(path => (path as SVGGraphicsElement).getBoundingClientRect())
      .filter(box => box.width > staffBox.width * .7 && box.height < 2)
    if (!lines.length) return []
    const house = ending.getBoundingClientRect()
    return [Math.min(...lines.map(line => line.top)) - house.bottom]
  }))
  expect(gaps.length).toBeGreaterThan(0)
  for (const gap of gaps) {
    expect(gap).toBeGreaterThanOrEqual(0)
    expect(gap).toBeLessThanOrEqual(4.5)
  }
})

test('besame staff spacing stays compact with ending brackets', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 })
  await page.addInitScript(() => localStorage.setItem('m3n:measure-numbers', '1'))
  await page.goto('/scores/besame_mucho_01')
  await selectNotationMode(page, '五线谱')
  const paper = page.locator('.score-paper')
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  const rows = await paper.locator('g.system').evaluateAll(systems => systems.slice(0, 3).map(system => {
    const staffLines = [...system.querySelectorAll('g.staff path')].map(path => (path as SVGGraphicsElement).getBoundingClientRect())
      .filter(box => box.width > 100 && box.height < 2)
    return { top: Math.min(...staffLines.map(box => box.top)), bottom: Math.max(...staffLines.map(box => box.bottom)) }
  }))
  expect(rows.length).toBe(3)
  const gaps = rows.slice(1).map((row, index) => row.top - rows[index]!.bottom)
  const rowsWithNumbers = await paper.locator('g.system').evaluateAll(systems => systems.slice(0, 4).map(system => {
    const paths = [...system.querySelectorAll('g.staff path')].map(path => (path as SVGGraphicsElement).getBoundingClientRect())
      .filter(box => box.width > 100 && box.height < 2)
    const number = system.querySelector('g.mNum')?.getBoundingClientRect()
    return { staffTop: Math.min(...paths.map(path => path.top)), numberTop: number?.top, numberBottom: number?.bottom }
  }))
  for (const row of rowsWithNumbers) {
    if (row.numberBottom !== undefined) expect(row.staffTop - row.numberBottom).toBeLessThan(32)
  }
  for (const gap of gaps) expect(gap).toBeLessThan(40)
})
