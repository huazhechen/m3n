import { expect, test } from '@playwright/test'
import { openScoreSettings } from './score-settings'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('m3n:render-mode', 'paged')
    localStorage.setItem('m3n:local-scores', JSON.stringify([1, 30, 160].map(rows => ({
      id: `local-pages-${rows}`,
      source: '{title=分页测试}{4/4}\nN: ' + Array.from({ length: rows }, (_, index) => `${index ? '{br}' : ''}1 2 3 4${index === rows - 1 ? ' |||' : ' |'}`).join(' '),
      createdAt: '2026-11-16T00:00:00Z', expiresAt: null,
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
          wholePages: sheets.every(sheet => Math.abs(sheet.height / sheet.width - 297 / 210) < 0.001),
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
  await page.goto('/scores/na_xie_nian_01')
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

test('narrow screens keep full-width vertical pages and mode changes restore continuous layout', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/scores/local-pages-30')
  const paper = page.locator('.score-paper')
  await expect(paper).toHaveAttribute('data-viewport-paged', 'true')
  for (const width of [720, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(paper).not.toHaveAttribute('data-viewport-paged')
    await expect(paper.locator('.score-page-sheet').nth(1)).toBeVisible()
    const bounds = await paper.boundingBox()
    const first = (await paper.locator('.score-page-sheet').nth(0).boundingBox())!
    const second = (await paper.locator('.score-page-sheet').nth(1).boundingBox())!
    expect(first.width).toBeCloseTo(bounds!.width, 0)
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
  expect(selectedWidth).toBeGreaterThanOrEqual(540)
  expect(selectedWidth).toBeLessThanOrEqual(720)
})

test('a non-touch portrait window keeps desktop page fitting', async ({ page }) => {
  await page.setViewportSize({ width: 744, height: 1133 })
  await page.goto('/scores/local-pages-30')
  await expect(page.locator('.score-paper')).toHaveAttribute('data-viewport-paged', 'true')
  await expect(page.locator('.top-nav .nav-action-label').first()).toBeVisible()
})

test.describe('touch tablets', () => {
  test.use({ hasTouch: true })

  test('iPad mini pages use the full width in both orientations and in split view', async ({ page }, info) => {
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
      await expect(paper).not.toHaveAttribute('data-viewport-paged')
      await expect(page.locator('.top-nav .nav-action-label').first()).toBeHidden()
      await expect.poll(() => paper.evaluate(element => {
        const sheets = [...element.querySelectorAll('.score-page-sheet')].map(sheet => sheet.getBoundingClientRect())
        return {
          fullWidth: Math.abs(sheets[0]!.width - (innerWidth - 18)) < 1,
          stacked: sheets[1]!.top >= sheets[0]!.bottom + 15,
          horizontalScroll: document.documentElement.scrollWidth > innerWidth,
        }
      })).toEqual({ fullWidth: true, stacked: true, horizontalScroll: false })
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
        sixPercentFrame: Math.abs(left / svg.width - 0.06) < 0.001,
        horizontalScroll: document.documentElement.scrollWidth > innerWidth,
      }
    })).toEqual({ frameFillsReader: true, symmetricPadding: true, sixPercentFrame: true, horizontalScroll: false })
  })

  test('tablet editor switches panes without losing input and library uses compact cards', async ({ page }) => {
    await page.setViewportSize({ width: 1133, height: 744 })
    await page.goto('/editor')
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
