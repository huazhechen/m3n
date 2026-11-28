import { expect, test } from '@playwright/test'
import { openScoreSettings } from './score-settings'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('m3n:render-mode', 'paged')
    localStorage.setItem('m3n:local-scores', JSON.stringify([1, 30].map(rows => ({
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
