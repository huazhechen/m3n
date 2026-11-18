import { expect, test } from '@playwright/test'

test.describe('touch library columns', () => {
  test.use({ hasTouch: true })
  test('cards fill as many columns as the available width allows', async ({ page }) => {
    await page.goto('/scores')
    const list = page.locator('.score-list').first()
    const cards = list.locator('.score-card')
    await expect(cards.first()).toBeVisible()
    for (const [width, height, columns] of [[390, 844, 1], [744, 1133, 2], [1133, 744, 3], [768, 1024, 2], [1024, 768, 3]]) {
      await page.setViewportSize({ width: width!, height: height! })
      expect(await list.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(columns)
      await expect(cards.first().locator('.score-card-footer')).toBeHidden()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      if (columns! > 1) {
        const first = (await cards.nth(0).boundingBox())!
        const second = (await cards.nth(1).boundingBox())!
        expect(second.x).toBeGreaterThan(first.x)
        expect(second.y).toBeCloseTo(first.y, 0)
      }
    }
  })
})

const sources = [
  '{title=筛选样本甲}{composer=测试作者}{key=G}{2/4}\nN: 1 2 |||\nB: 1d^ |\nL: 春风',
  '{title=筛选样本乙}{composer=另一作者}{key=Gb}{2/4}\nN: 1 2 |||',
  '{title=筛选样本丙}{key=G}{3/4}\nN: 1 2 3 |||\nL: 春风来',
]

for (const width of [390, 1280]) {
  test(`library uses one search and responsive centered metadata at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(sources => {
      localStorage.setItem('m3n:local-scores', JSON.stringify(sources.map((source, index) => ({ id: `local-filter-${index}`, source, createdAt: new Date().toISOString(), expiresAt: null }))))
    }, sources)
    await page.goto('/scores')
    const search = page.getByRole('searchbox', { name: '搜索乐谱' })
    const heading = page.getByRole('heading', { name: '乐谱库', exact: true })
    await expect(search).toBeVisible()
    await expect(page.locator('select')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '紧凑列表' })).toHaveCount(0)
    const titleBounds = (await heading.boundingBox())!
    const searchBounds = (await search.boundingBox())!
    expect(Math.abs(titleBounds.y + titleBounds.height / 2 - searchBounds.y - searchBounds.height / 2)).toBeLessThan(2)
    const cards = page.locator('.score-list .score-card')
    await search.fill('本地')
    await expect(cards).toHaveCount(3)
    await search.fill('本地 词')
    await expect(cards).toHaveCount(2)
    await search.fill('本地 低')
    await expect(cards).toHaveCount(1)
    await expect(cards.first().locator('.score-notation-tags')).toContainText('词')
    await expect(cards.first().locator('.score-notation-tags')).toContainText('低')
    await expect(cards.first().locator('h3')).toHaveCSS('text-align', 'center')
    await expect(cards.first().locator('.score-notation-tags')).toHaveCSS('justify-content', 'center')
    if (width <= 720) {
      await expect(cards.first().locator('.score-card-footer')).toBeHidden()
      expect((await cards.first().boundingBox())!.height).toBeLessThan(130)
    } else {
      await expect(cards.first().locator('.score-card-footer')).toBeVisible()
      expect((await cards.first().boundingBox())!.height).toBeGreaterThanOrEqual(160)
    }
    await search.fill('本地 G')
    await expect(cards).toHaveCount(2)
    await search.fill('本地 2/4')
    await expect(cards).toHaveCount(2)
    await search.fill('本地 G 2/4 词 低')
    await expect(cards).toHaveCount(1)
    await expect(cards.first()).toContainText('筛选样本甲')
    await search.fill('内置')
    expect(await cards.count()).toBeGreaterThan(50)
    await expect(page.locator('.score-list .is-local-card')).toHaveCount(0)
    await search.fill('本地 测试作者')
    await expect(cards).toHaveCount(1)
    await page.screenshot({ path: info.outputPath('library.png'), fullPage: true })
    await search.fill('本地 不存在的标题')
    await expect(cards).toHaveCount(0)
    await expect(page.getByText('没有找到匹配的乐谱。')).toBeVisible()
  })
}
