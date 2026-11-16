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

test('desktop pages fit the remaining height, center side by side and respond to resizing', async ({ page }, info) => {
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
        return {
          fits: sheets.every(sheet => sheet.top >= 0 && sheet.bottom <= innerHeight),
          sameRow: sheets.every(sheet => Math.abs(sheet.top - sheets[0]!.top) < 1),
          centered: Math.abs((sheets[0]!.left + sheets.at(-1)!.right) / 2 - (bounds.left + bounds.right) / 2) < 1,
          scrolls: document.documentElement.scrollHeight > innerHeight + 1,
        }
      })).toEqual({ fits: true, sameRow: true, centered: true, scrolls: false })
    }
    await page.screenshot({ path: info.outputPath(`reader-${pages}-pages.png`) })
  }
})

test('extra pages wrap to centered rows and use document scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/scores/local-pages-160')
  const paper = page.locator('.score-paper')
  await expect(paper).toHaveAttribute('data-viewport-paged', 'true')
  await expect(paper.locator('.score-page-sheet')).toHaveCount(8)
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

test('narrow screens keep full-width vertical pages and mode changes restore continuous layout', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/scores/local-pages-30')
  const paper = page.locator('.score-paper')
  await expect(paper).toHaveAttribute('data-viewport-paged', 'true')
  for (const width of [720, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(paper).not.toHaveAttribute('data-viewport-paged')
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
  await expect(paper.locator('svg').first()).toHaveAttribute('width', '780')
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
    await page.getByRole('switch', { name: '分页', exact: true }).click()
    await expect(paper).toHaveAttribute('data-render-mode', 'continuous')
    await expect(paper.locator('svg').first()).toHaveAttribute('width', '780')
    await expect.poll(async () => (await paper.locator('svg').first().boundingBox())!.width)
      .toBeCloseTo(1133 - 18, 0)
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
    expect((await card.boundingBox())!.width).toBeCloseTo(744 - 18, 0)
  })
})
