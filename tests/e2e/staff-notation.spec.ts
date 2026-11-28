import { waitForEditor, selectionStart } from './editor-state'
import { expect, test } from '@playwright/test'
import { scoreLayoutConfig } from '@m3n/numbered-notation/layout-config'
import { readFile } from 'node:fs/promises'
import { PDFDocument, PDFDict, PDFName } from 'pdf-lib'
import { openScoreSettings, selectNotationMode } from './score-settings'
import { staffInkBounds } from '../../tools/lib/staff-ink-collisions.mjs'

const widthConfig = scoreLayoutConfig.pageWidth

test('staff editor preserves width, locates source, highlights playback and keeps playback alive across modes and transposition', async ({ page }, info) => {
  const wasm: string[] = []
  page.on('request', request => { if (request.url().includes('.wasm')) wasm.push(request.url()) })
  await page.goto('/editor')
  await waitForEditor(page)
  const source = '{title=五线谱验证}{key=D}{4/4}{60qpm}\nN: [123:2] 4 5 | [135:h] 6 7 1e | 1e 7 6 5 |||\nL: 春夏秋冬天 | 山川天地 | 明月清风\nB: 1d 2d 3d 4d | 5d 6d 7d 1 | 1 7d 6d 5d |'
  await page.getByLabel('M3N source').fill(source)
  const paper = page.locator('.score-paper')
  await expect(paper.locator('svg[data-engine="m3n"]').first()).toBeVisible()
  expect(wasm).toHaveLength(0)
  await openScoreSettings(page)
  await expect(page.getByRole('slider', { name: '乐谱宽度' })).toHaveValue('30')
  await expect(paper.locator('svg[data-engine="m3n"]').first()).toHaveAttribute('width', '720')
  await selectNotationMode(page, '五线谱')
  await expect(paper).toHaveAttribute('data-notation', 'staff')
  await expect(paper.locator('g.staff').first()).toBeVisible()
  await expect(paper.locator('svg svg, use, polygon, polyline, ellipse')).toHaveCount(0)
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  await expect(paper.locator(':scope > .score-page-sheet > svg, :scope > svg').first()).toHaveAttribute('width', '720')
  expect(wasm).toHaveLength(0)
  await page.keyboard.press('Escape')
  await paper.locator('[id="m3n-e-2"] .notehead').first().click()
  await expect.poll(() => selectionStart(page.getByLabel('M3N source'))).toBe(source.indexOf('[123:2]'))
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
  await openScoreSettings(page)
  await expect(page.getByRole('slider', { name: '乐谱宽度' })).toHaveValue('30')
  await expect(paper.locator('svg[data-engine="m3n"]').first()).toHaveAttribute('width', '720')
  await expect(paper.locator('svg[data-engine="m3n"]').first()).toBeVisible()
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
  await selectNotationMode(page, '首调')
  await expect(paper).toHaveAttribute('data-fixed-do', 'false')
  await selectNotationMode(page, '五线谱')
  await expect(paper.locator('g.staff').first()).toBeVisible()
  expect(wasm).toHaveLength(0)
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await page.keyboard.press('Escape')
  await paper.screenshot({ path: info.outputPath('staff.png') })
  await page.reload()
  await expect(paper).toHaveAttribute('data-notation', 'staff')
  await expect(paper.locator('g.staff').first()).toBeVisible()
})

test('staff pagination, tempo and transposition are shared by screen, PNG and vector PDF exports', async ({ page }, info) => {
  await page.goto('/editor')
  await waitForEditor(page)
  await page.getByLabel('M3N source').fill('{title=五线谱导出}{key=G}{4/4}{90qpm}\nN: ' + Array.from({ length: 16 }, (_, index) => index === 0 ? '{cresc}[135:h]. 2_ 3 4{/}' : '1 2 3 4').join(' | {br} ') + ' |||\nB: ' + Array.from({ length: 16 }, () => '1d 2d 3d 4d').join(' | ') + ' |')
  await selectNotationMode(page, '五线谱')
  await openScoreSettings(page)
  await page.getByRole('slider', { name: '乐谱宽度' }).fill(String(576 / widthConfig.unit))
  await page.getByRole('slider', { name: '播放速度', exact: true }).fill('137')
  const paper = page.locator('.score-paper')
  await expect.poll(async () => (await paper.locator('text').allTextContents()).join('')).toContain('137')
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  await expect.poll(() => paper.locator('.score-page-sheet').count()).toBeGreaterThan(1)
  const pageCount = await paper.locator('.score-page-sheet').count()
  expect(pageCount).toBeGreaterThan(1)
  await page.getByRole('switch', { name: '分页', exact: true }).click()
  await expect(paper).toHaveAttribute('data-render-mode', 'continuous')
  await expect(paper.locator(':scope > svg')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page).toHaveURL(/\/scores\//)
  await expect(paper).toHaveAttribute('data-render-mode', 'continuous')
  await openScoreSettings(page)
  const pagination = page.getByRole('switch', { name: '分页', exact: true })
  if (!await pagination.isChecked()) await pagination.click()
  await expect(paper).toHaveAttribute('data-render-mode', 'paged')
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  await expect.poll(() => paper.locator('.score-page-sheet').count()).toBeGreaterThan(1)
  const readerPageCount = await paper.locator('.score-page-sheet').count()
  expect(readerPageCount).toBeGreaterThan(1)
  await page.keyboard.press('Escape')
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
      expect(pdf.getPageCount()).toBe(readerPageCount)
      expect(pdf.context.enumerateIndirectObjects().some(([, object]) => object instanceof PDFDict && /Bravura/.test(object.get(PDFName.of('BaseFont'))?.toString() ?? ''))).toBe(true)
      expect(pdf.context.enumerateIndirectObjects().some(([, object]) => object instanceof PDFDict && object.get(PDFName.of('Subtype')) === PDFName.of('Image'))).toBe(false)
    } else expect(bytes.subarray(1, 4).toString()).toBe('PNG')
  }
})

test('keyed visits keep source clicks and highlight the performed staff occurrence', async ({ page }) => {
  await page.goto('/editor')
  await waitForEditor(page)
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
  await expect(paper.locator('[id="m3n-e-1-rend2-v1"]')).toHaveClass(/is-playing/)
  await expect(paper.locator('[id="m3n-e-1-rend2-v1"] text').first()).toHaveCSS('fill', 'rgb(184, 130, 0)')
  await expect(paper.locator('[id="m3n-e-1"]')).not.toHaveClass(/is-playing/)
  await page.getByRole('button', { name: '暂停', exact: true }).click()
})

test('staff lyrics highlight the matching verse during a written repeat', async ({ page }) => {
  await page.goto('/editor')
  await waitForEditor(page)
  await page.getByLabel('M3N source').fill('{2/4}{120qpm}\nN: ||: 1 2 :||\nL1: 春天\nL2: 秋天')
  await selectNotationMode(page, '五线谱')
  await page.keyboard.press('Escape')
  const paper = page.locator('.score-paper')
  await expect(paper.locator('g.staff').first()).toBeVisible()
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  const firstVerse = paper.locator('[id="m3n-e-1-v1"]')
  const secondVerse = paper.locator('[id="m3n-e-1-v2"]')
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await expect(firstVerse).toHaveClass(/is-playing/)
  await expect(secondVerse).not.toHaveClass(/is-playing/)
  // Observe one playback frame: sequential assertions can cross a short note.
  await expect.poll(() => paper.evaluate(element => {
    const first = element.querySelector('[id="m3n-e-1-v1"]')!
    const second = element.querySelector('[id="m3n-e-1-v2"]')!
    return { first: first.classList.contains('is-playing'), second: second.classList.contains('is-playing'), fill: getComputedStyle(second.querySelector('text')!).fill }
  })).toEqual({ first: false, second: true, fill: 'rgb(184, 130, 0)' })
})

test('a failed staff module permits numbered notation and recovers after reload', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('m3n:notation-mode', 'staff'))
  const staffModules = /\/(?:staff-score|staff-engine)[^/]*\.js$/
  await page.route(staffModules, route => route.abort())
  await page.goto('/scores/huan_le_song_01')
  await expect(page.locator('.render-message')).toBeVisible()
  await selectNotationMode(page, '首调')
  await expect(page.locator('.score-paper svg[data-engine="m3n"]').first()).toBeVisible()
  await expect(page.locator('.render-message')).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: '准备五线谱', exact: true })).toHaveCount(0)
  // Failed ESM imports remain in the browser module map. A reload starts a
  // fresh module graph; switching notation alone cannot retry that URL.
  await page.unroute(staffModules)
  await page.reload()
  await selectNotationMode(page, '五线谱')
  await expect(page.locator('.score-paper g.staff').first()).toBeVisible()
  await expect(page.locator('.render-message')).toHaveCount(0)
})

test('basic exercises keep section labels and Chinese directions inside staff pages', async ({ page }) => {
  const source = await readFile('src/scores/ban_yin_jie_kou_qin_ji_ben_gong_01.m3n', 'utf8')
  await page.goto('/editor')
  await waitForEditor(page)
  await page.addScriptTag({ content: staffInkBounds.toString() })
  await page.getByLabel('M3N source').fill(source)
  await selectNotationMode(page, '五线谱')
  await openScoreSettings(page)
  const paper = page.locator('.score-paper')
  for (const width of [576, 648, 720]) {
    await openScoreSettings(page)
    await page.getByRole('slider', { name: '乐谱宽度' }).fill(String(width / widthConfig.unit))
    const pages = paper.locator(':scope > .score-page-sheet > svg, :scope > svg')
    await expect(pages.first()).toHaveAttribute('width', String(width))
    await expect(paper).not.toHaveAttribute('aria-busy', 'true')
    const outside = await pages.evaluateAll(elements => elements.flatMap((element, index) => {
      const svg = element as SVGSVGElement, ink = (window as unknown as { staffInkBounds: (svg: SVGSVGElement) => DOMRect }).staffInkBounds(svg), box = svg.viewBox.baseVal
      const tolerance = 2 + box.width / Number(svg.getAttribute('width')) * 0.5
      return ink.x < -tolerance || ink.y < -tolerance || ink.x + ink.width > box.width + tolerance || ink.y + ink.height > box.height + tolerance ? [{ page: index + 1, ink: { x: ink.x, y: ink.y, width: ink.width, height: ink.height }, viewBox: { width: box.width, height: box.height } }] : []
    }))
    expect(outside, `${width}px staff pages`).toEqual([])
    const headings = await paper.locator('g.system').evaluateAll(systems => systems.flatMap(system => {
      const heading = system.querySelector('g.reh')
      if (!heading) return []
      const directions = [...system.querySelectorAll('g.dir')]
      const tempos = [...system.querySelectorAll('g.tempo')]
      const ink = (group: Element) => (window as unknown as { staffInkBounds: (svg: Element, scope: Element) => DOMRect }).staffInkBounds(system.ownerSVGElement!, group)
      const headingInk = ink(heading)
      return [{
        label: heading.textContent,
        top: headingInk.y,
        bottom: headingInk.y + headingInk.height,
        directionTop: Math.min(...directions.map(direction => ink(direction).y)),
        tempoBottom: Math.max(...tempos.map(tempo => { const box = ink(tempo); return box.y + box.height })),
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
    const pages = await paper.locator('svg[data-notation="staff"]').evaluateAll(pages => pages.map(svg => {
      const systems = [...svg.querySelectorAll('g.system')]
      // Row numbers are moved to the final SVG overlay so their masks paint
      // above every ending bracket. They are no longer measure descendants.
      const numbers = [...svg.querySelectorAll('g.mNum')]
      const rows = systems.filter(system => !system.querySelector('g.measure:last-of-type [data-m3n-role="interlude"]'))
      return { systems: systems.length, count: numbers.length, expected: rows.length,
        labels: rows.map((system, index) => {
          const last = [...system.querySelectorAll('g.measure')].at(-1)!
          const right = Math.max(...[...last.querySelectorAll('g.staff-bar path')].map(path => path.getBoundingClientRect().right))
          const number = numbers[index]
          return { text: number?.textContent?.replace(/\s/g, ''), rightGap: right - (number?.getBoundingClientRect().right ?? 0),
            overlay: number?.parentElement?.parentElement === svg }
        }) }
    }))
    expect(pages.reduce((sum, page) => sum + page.systems, 0)).toBeGreaterThan(1)
    for (const page of pages) {
      expect(page.count).toBe(page.expected)
      for (const label of page.labels) {
        expect(label.overlay).toBe(true)
        expect(label.text).toMatch(/^\d+$/)
        expect(Math.abs(label.rightGap)).toBeLessThan(2)
      }
    }
  }
  await openScoreSettings(page)
  await page.getByRole('switch', { name: '小节号', exact: true }).click()
  await expect(paper.locator('g.mNum')).toHaveCount(0)
})

test('row-end measure numbers retain white masks alongside endings in both notation modes', async ({ page }) => {
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
    const attached = await paper.locator('svg').evaluateAll(pages => pages.flatMap(svg => {
      if (!svg.querySelector('g.ending,[data-m3n-relation="volta"]')) return []
      return [...svg.querySelectorAll('g.mNum,[data-m3n-role="measure-number"]')].map(number => {
        const group = number.tagName.toLowerCase() === 'g' ? number : number.parentElement!
        const label = group.querySelector('text')!
        const background = group.querySelector('rect')!
        const box = background.getBoundingClientRect()
        return { fill: getComputedStyle(background).fill, width: box.width, height: box.height,
          behind: Boolean(background.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING) }
      })
    }))
    expect(attached.length).toBeGreaterThan(0)
    for (const { fill, width, height, behind } of attached) {
      expect(fill, `${mode} row-end number has a white mask`).toBe('rgb(255, 255, 255)')
      expect(width).toBeGreaterThan(0)
      expect(height).toBeGreaterThan(0)
      expect(behind).toBe(true)
    }
  }
})

test('staff volta hooks, separation, and music clearance stay correct', async ({ page }) => {
  await page.goto('/editor')
  await waitForEditor(page)
  await page.getByLabel('M3N source').fill(await readFile('src/scores/besame_mucho_01.m3n', 'utf8'))
  await selectNotationMode(page, '五线谱')
  const paper = page.locator('.score-paper')
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  // The second ending continues across systems at this width.
  const continuedEnding = paper.locator('g.ending.id-m3n-ending-2')
  await expect(continuedEnding.locator('.m3n-ending-start-hook')).toHaveCount(1)

  // A small fixture guarantees two adjacent endings regardless of library widths.
  await waitForEditor(page)
  await page.keyboard.press('Escape')
  await page.getByLabel('M3N source').fill('{4/4}\nN: ||: 1 2 3 4 |\n---V1\nN: 5 6 7 1e :||\n---V2\nN: 5 4 3 1 |||')
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  await waitForEditor(page)
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

  await page.goto('/scores/besame_mucho_01')
  await selectNotationMode(page, '五线谱')
  await expect(paper).not.toHaveAttribute('aria-busy', 'true')
  await page.addScriptTag({ content: staffInkBounds.toString() })
  const gaps = await paper.locator('g.system').evaluateAll(systems => systems.flatMap(system => {
    const ending = system.querySelector('g.ending.voltaBracket, g.ending .voltaBracket')
    const staff = system.querySelector('g.staff')
    if (!ending || !staff || !ending.querySelector('path')) return []
    const lines = [...staff.querySelectorAll('path.staff-line')].map(path => (path as SVGGraphicsElement).getBoundingClientRect())
    if (!lines.length) return []
    const svg = system.ownerSVGElement!
    const ink = (group: Element) => {
      const bounds = (window as unknown as { staffInkBounds: (svg: Element, scope: Element) => DOMRect }).staffInkBounds(svg, group)
      const top = new DOMPoint(bounds.x, bounds.y).matrixTransform(svg.getScreenCTM()!)
      const bottom = new DOMPoint(bounds.x + bounds.width, bounds.y + bounds.height).matrixTransform(svg.getScreenCTM()!)
      return { top: top.y, bottom: bottom.y }
    }
    const house = ink(ending.closest('g.m3n-ending-row') ?? ending)
    const staffTop = Math.min(...lines.map(line => line.top))
    // Endings share a baseline across measures; use the complete row's music.
    const music = [...system.querySelectorAll('g.note,g.chord,g.rest,g.beam,g.tie,g.slur,g.tupletNum')].map(ink)
    const protrusion = Math.max(0, staffTop - Math.min(...music.map(b => b.top)))
    const scale = svg.viewBox.baseVal.width / svg.getBoundingClientRect().width
    return [{ gap: (staffTop - house.bottom) * scale, protrusion: protrusion * scale }]
  }))
  expect(gaps.length).toBeGreaterThan(0)
  for (const { gap, protrusion } of gaps) {
    expect(gap).toBeGreaterThanOrEqual(0)
    // The bracket and its label clear the complete row's music.
    expect(gap).toBeLessThanOrEqual(protrusion + 8)
  }
})

test('besame staff spacing stays compact with ending brackets', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 })
  await page.addInitScript(() => localStorage.setItem('m3n:measure-numbers', '1'))
  await page.goto('/scores/besame_mucho_01')
  await selectNotationMode(page, '五线谱')
  const paper = page.locator('.score-paper')
  await expect(paper).not.toHaveAttribute('aria-busy', 'true', { timeout: 30_000 })
  const rows = await paper.locator('g.system').evaluateAll(systems => systems.slice(0, 3).map(system => {
    const staffLines = [...system.querySelectorAll('g.staff path')].map(path => (path as SVGGraphicsElement).getBoundingClientRect())
      .filter(box => box.width > 100 && box.height < 2)
    const svg = system.ownerSVGElement!
    const scale = svg.viewBox.baseVal.width / svg.getBoundingClientRect().width
    return { top: Math.min(...staffLines.map(box => box.top)) * scale, bottom: Math.max(...staffLines.map(box => box.bottom)) * scale }
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
