import { waitForEditor } from './editor-state'
import { expect, test } from '@playwright/test'
import { openScoreSettings } from './score-settings'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('m3n:render-mode', 'paged')
    localStorage.setItem('m3n:local-scores', JSON.stringify([1, 30, 160].map(rows => ({
      id: `local-pages-${rows}`,
      source: '{title=分页测试}{4/4}\nN: ' + Array.from({ length: rows }, (_, index) => `${index ? '{br}' : ''}1 2 3 4${index === rows - 1 ? ' |||' : ' |'}`).join(' '),
      createdAt: '2026-11-16T00:00:00Z',
    }))))
  })
})

test('desktop pages fit the remaining height, center each row and respond to resizing', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  for (const [rows, pages] of [[1, 1], [30, 2]]) {
    await page.goto(`/scores/local-pages-${rows}`)
    const paper = page.locator('.score-paper')
    await expect(paper).toHaveAttribute('data-viewport-paged', 'true')
    await expect(paper.locator('.score-page-sheet')).toHaveCount(pages!)
    for (const height of [900, 720, 1000]) {
      await page.setViewportSize({ width: 1280, height })
      await expect.poll(() => paper.evaluate(element => {
        const sheets = [...element.querySelectorAll('.score-page-sheet')].map(sheet => sheet.getBoundingClientRect())
        const bounds = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        const availableWidth = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
        const gap = parseFloat(style.columnGap)
        const shouldShareRow = sheets.reduce((sum, sheet) => sum + sheet.width, 0) + gap * (sheets.length - 1) <= availableWidth + 1
        const rows = sheets.reduce<DOMRect[][]>((groups, sheet) => {
          const row = groups.find(group => Math.abs(group[0]!.top - sheet.top) < 1)
          if (row) row.push(sheet)
          else groups.push([sheet])
          return groups
        }, [])
        return {
          firstRowFits: rows[0]!.every(sheet => sheet.top >= 0 && sheet.bottom <= innerHeight),
          wholePages: sheets.every(sheet => Math.abs(sheet.height / sheet.width - 300.7419354839 / 210) < 0.001),
          wrappingMatchesSpace: (rows.length === 1) === shouldShareRow,
          centered: rows.every(row => Math.abs((row[0]!.left + row.at(-1)!.right) / 2 - (bounds.left + bounds.right) / 2) < 1),
          scrollingMatchesRows: (document.documentElement.scrollHeight > innerHeight + 1) === (rows.length > 1),
          horizontalScroll: document.documentElement.scrollWidth > innerWidth,
        }
      })).toEqual({ firstRowFits: true, wholePages: true, wrappingMatchesSpace: true, centered: true, scrollingMatchesRows: true, horizontalScroll: false })
    }
    await page.screenshot({ path: info.outputPath(`reader-${pages}-pages.png`) })
  }
})

test('extra pages wrap to centered rows and use document scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/scores/local-pages-160')
  const paper = page.locator('.score-paper')
  await expect(paper).toHaveAttribute('data-viewport-paged', 'true')
  await expect.poll(() => paper.locator('.score-page-sheet').count()).toBeGreaterThan(2)
  await expect.poll(() => paper.evaluate(element => {
    const sheets = [...element.querySelectorAll('.score-page-sheet')].map(sheet => sheet.getBoundingClientRect())
    return {
      wraps: sheets.at(-1)!.top > sheets[0]!.bottom,
      firstRowFits: sheets[0]!.bottom < innerHeight,
      scrolls: document.documentElement.scrollHeight > innerHeight,
      horizontalScroll: document.documentElement.scrollWidth > innerWidth,
      innerScroll: element.scrollHeight > element.clientHeight,
    }
  })).toEqual({ wraps: true, firstRowFits: true, scrolls: true, horizontalScroll: false, innerScroll: false })
})

test('wide desktop readers use the available window width for side-by-side pages', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/scores/local-pages-30')
  const paper = page.locator('.score-paper')
  await expect(paper).toHaveAttribute('data-viewport-paged', 'true')
  await expect(paper.locator('.score-page-sheet')).toHaveCount(2)
  await expect.poll(() => paper.evaluate(element => {
    const [first, second] = [...element.querySelectorAll('.score-page-sheet')].map(sheet => sheet.getBoundingClientRect())
    return {
      sideBySide: Math.abs(first!.top - second!.top) < 1 && second!.left > first!.right,
      fitsHeight: first!.bottom <= innerHeight,
      fillsWindow: Math.abs(element.getBoundingClientRect().width - (innerWidth - 32)) < 1,
      horizontalScroll: document.documentElement.scrollWidth > innerWidth,
    }
  })).toEqual({ sideBySide: true, fitsHeight: true, fillsWindow: true, horizontalScroll: false })
})

test('narrow screens fit whole vertical pages and mode changes restore continuous layout', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/scores/local-pages-30')
  const paper = page.locator('.score-paper')
  await expect(paper).toHaveAttribute('data-viewport-paged', 'true')
  for (const width of [720, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(paper).toHaveAttribute('data-viewport-paged', 'true')
    await expect(paper.locator('.score-page-sheet').nth(1)).toBeVisible()
    const bounds = await paper.boundingBox()
    const first = (await paper.locator('.score-page-sheet').nth(0).boundingBox())!
    const second = (await paper.locator('.score-page-sheet').nth(1).boundingBox())!
    expect(first.width).toBeLessThanOrEqual(bounds!.width + 1)
    const transport = (await page.locator('.control-transport').boundingBox())!
    expect(first.y + first.height).toBeLessThanOrEqual(transport.y)
    expect(first.x + first.width / 2).toBeCloseTo(bounds!.x + bounds!.width / 2, 0)
    expect(second.y).toBeGreaterThan(first.y + first.height)
  }
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(paper).toHaveAttribute('data-viewport-paged', 'true')
  await openScoreSettings(page)
  await page.getByRole('switch', { name: '分页', exact: true }).click()
  await expect(paper).toHaveAttribute('data-render-mode', 'continuous')
  await expect(paper).not.toHaveAttribute('data-viewport-paged')
  await expect(paper.locator('.score-page-sheet')).toHaveCount(0)
  const selectedWidth = Number(await paper.locator('svg').first().getAttribute('width'))
  expect(selectedWidth).toBeGreaterThanOrEqual(528)
  expect(selectedWidth).toBeLessThanOrEqual(768)
})

for (const notation of ['movable', 'staff']) {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 720, height: 600 },
    { width: 1280, height: 900 },
    { width: 3200, height: 900 },
  ]) {
    test(`${notation} ${viewport.width}px: single and multiple pages share whole-page bounds`, async ({ page }) => {
      await page.addInitScript(notation => localStorage.setItem('m3n:notation-mode', notation), notation)
      await page.setViewportSize(viewport)
      let singleWidth = 0
      for (const rows of [1, 30]) {
        await page.goto(`/scores/local-pages-${rows}`)
        const paper = page.locator('.score-paper')
        await expect(paper).toHaveAttribute('data-viewport-paged', 'true')
        await expect(paper).not.toHaveAttribute('aria-busy', 'true')
        for (const immersive of [false, true]) {
          if (immersive) await page.getByRole('button', { name: '沉浸浏览', exact: true }).click()
          await expect.poll(() => paper.evaluate((element, immersive) => {
            const sheets = [...element.querySelectorAll('.score-page-sheet')].map(sheet => sheet.getBoundingClientRect())
            const first = sheets[0]!
            const firstRow = sheets.filter(sheet => Math.abs(sheet.top - first.top) < 1)
            const header = document.querySelector('.top-nav')!.getBoundingClientRect()
            const controls = document.querySelector('.control-transport')!.getBoundingClientRect()
            const multipleRows = firstRow.length < sheets.length
            return {
              firstFits: first.top >= (immersive ? 0 : header.bottom)
                && first.bottom <= (immersive ? innerHeight : controls.top),
              horizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
              verticalScrollMatchesRows: (document.documentElement.scrollHeight > innerHeight) === multipleRows,
              innerScroll: element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth,
              narrowStacked: innerWidth > 720 || firstRow.length === 1,
            }
          }, immersive)).toEqual({
            firstFits: true, horizontalScroll: false, verticalScrollMatchesRows: true,
            innerScroll: false, narrowStacked: true,
          })
          if (!immersive) {
            const width = (await paper.locator('.score-page-sheet').first().boundingBox())!.width
            if (rows === 1) singleWidth = width
            else expect(width).toBeCloseTo(singleWidth, 0)
          }
        }
      }
    })
  }
}

test('a non-touch portrait window keeps desktop page fitting', async ({ page }) => {
  await page.setViewportSize({ width: 744, height: 1133 })
  await page.goto('/scores/local-pages-30')
  await expect(page.locator('.score-paper')).toHaveAttribute('data-viewport-paged', 'true')
  await expect(page.locator('.top-nav .nav-action-label').first()).toBeVisible()
})

test.describe('touch tablets', () => {
  test.use({ hasTouch: true })

  test('iPad mini pages fit the available viewport in both orientations and in split view', async ({ page }, info) => {
    await page.setViewportSize({ width: 744, height: 1133 })
    await page.goto('/scores/local-pages-30')
    const paper = page.locator('.score-paper')
    await expect(paper.locator('.score-page-sheet')).toHaveCount(2)
    for (const viewport of [
      { width: 744, height: 1133 },
      { width: 1133, height: 744 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 507, height: 1133 },
    ]) {
      await page.setViewportSize(viewport)
      await expect(paper).toHaveAttribute('data-viewport-paged', 'true')
      await expect(page.locator('.top-nav .nav-action-label').first()).toBeHidden()
      await expect.poll(() => paper.evaluate(element => {
        const sheets = [...element.querySelectorAll('.score-page-sheet')].map(sheet => sheet.getBoundingClientRect())
        return {
          fitsWidth: sheets[0]!.width <= innerWidth - 18 + 1,
          fitsHeight: sheets[0]!.bottom <= document.querySelector('.control-transport')!.getBoundingClientRect().top,
          centered: Math.abs((sheets[0]!.left + sheets[0]!.right) / 2 - innerWidth / 2) < 1,
          stacked: sheets[1]!.top >= sheets[0]!.bottom + 15,
          horizontalScroll: document.documentElement.scrollWidth > innerWidth,
        }
      })).toEqual({ fitsWidth: true, fitsHeight: true, centered: true, stacked: true, horizontalScroll: false })
    }
    await page.setViewportSize({ width: 1133, height: 744 })
    await page.screenshot({ path: info.outputPath('tablet-landscape-reader.png') })
    await openScoreSettings(page)
    const selectedWidth = await paper.locator('.score-page-sheet svg').first().getAttribute('width')
    await page.getByRole('switch', { name: '分页', exact: true }).click()
    await expect(paper).toHaveAttribute('data-render-mode', 'continuous')
    await expect(paper.locator('svg').first()).toHaveAttribute('width', selectedWidth!)
    await expect.poll(() => paper.evaluate(element => {
      const frame = element.getBoundingClientRect()
      const svg = element.querySelector('svg')!.getBoundingClientRect()
      const left = svg.left - frame.left, right = frame.right - svg.right
      return {
        frameFillsReader: Math.abs(frame.width - element.parentElement!.getBoundingClientRect().width) < 1,
        symmetricPadding: Math.abs(left - right) < 1,
        fourPercentFrame: Math.abs(left / svg.width - 0.04) < 0.001,
        horizontalScroll: document.documentElement.scrollWidth > innerWidth,
      }
    })).toEqual({ frameFillsReader: true, symmetricPadding: true, fourPercentFrame: true, horizontalScroll: false })
  })

  for (const notation of ['movable', 'staff']) {
    test(`${notation}: immersion refits a whole page and resets manual zoom on a narrow screen`, async ({ page }) => {
      await page.addInitScript(notation => localStorage.setItem('m3n:notation-mode', notation), notation)
      await page.setViewportSize({ width: 720, height: 600 })
      await page.goto('/scores/local-pages-30')
      const paper = page.locator('.score-paper')
      await expect(paper).toHaveAttribute('data-viewport-paged', 'true')
      await expect(paper).not.toHaveAttribute('aria-busy', 'true')
      const sheet = paper.locator('.score-page-sheet').first()
      const svg = sheet.locator('svg').first()
      await svg.evaluate(element => element.setAttribute('data-original-page', 'true'))
      const normalWidth = (await sheet.boundingBox())!.width
      await paper.evaluate(element => {
        const bounds = element.getBoundingClientRect()
        element.dispatchEvent(new WheelEvent('wheel', {
          deltaY: -200, clientX: bounds.left + 50, clientY: bounds.top + 50, cancelable: true,
        }))
      })
      await expect(paper).toHaveAttribute('data-zoomed', 'true')
      await page.getByRole('button', { name: '沉浸浏览', exact: true }).click()
      await expect(page.locator('.top-nav')).toBeHidden()
      await expect(paper).not.toHaveAttribute('data-zoomed', 'true')
      await expect.poll(async () => (await sheet.boundingBox())!.width).toBeGreaterThan(normalWidth + 10)
      for (const viewport of [{ width: 720, height: 600 }, { width: 600, height: 720 }]) {
        await page.setViewportSize(viewport)
        await expect.poll(() => sheet.evaluate(element => {
          const bounds = element.getBoundingClientRect()
          return bounds.top >= 0 && bounds.bottom <= (visualViewport?.height ?? innerHeight)
            && bounds.width <= innerWidth - 18 + 1
        })).toBe(true)
      }
      await page.getByRole('button', { name: '退出沉浸浏览', exact: true }).click()
      await expect(page.locator('.top-nav')).toBeVisible()
      await expect.poll(() => sheet.evaluate(element => {
        const bounds = element.getBoundingClientRect()
        const header = document.querySelector('.top-nav')!.getBoundingClientRect()
        const controls = document.querySelector('.control-transport')!.getBoundingClientRect()
        return bounds.top >= header.bottom && bounds.bottom <= controls.top
      })).toBe(true)
      await expect(svg).toHaveAttribute('data-original-page', 'true')
    })
  }

  test('tablet editor switches panes without losing input and library uses compact cards', async ({ page }) => {
    await page.setViewportSize({ width: 1133, height: 744 })
    await page.goto('/editor')
    await waitForEditor(page)
    const editor = page.getByRole('textbox', { name: 'M3N source', exact: true })
    const source = '{title=平板试改}{4/4}\nN: 1 2 3 4 |||'
    await editor.fill(source)
    await page.getByRole('tab', { name: '预览', exact: true }).click()
    await expect(editor).toBeHidden()
    await expect(page.locator('.editor-divider')).toBeHidden()
    await expect(page.locator('.score-paper')).toContainText('平板试改')
    await page.setViewportSize({ width: 744, height: 1133 })
    await page.getByRole('tab', { name: '源码', exact: true }).click()
    await expect(editor).toHaveText(source, { useInnerText: true })
    await page.goto('/scores')
    const card = page.locator('.score-list .score-card').first()
    await expect(card).toBeVisible()
    await expect(card.locator('.score-card-footer')).toBeHidden()
    const columns = await page.locator('.score-list').evaluateAll(elements => elements.map(element => getComputedStyle(element).gridTemplateColumns.split(' ').length))
    expect(columns.length).toBeGreaterThan(0)
    expect(columns.every(count => count === 2)).toBe(true)
  })
})
