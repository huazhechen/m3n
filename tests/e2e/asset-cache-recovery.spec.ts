import { expect, test } from '@playwright/test'

test('a direct score link loads without using module URLs previously cached as HTML', async ({ page }) => {
  const scripts: string[] = [], errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', async route => {
    const path = new URL(route.request().url()).pathname
    if (route.request().resourceType() === 'script') scripts.push(path)
    if (/^\/assets\/[^/]+\.js$/.test(path)) {
      return route.fulfill({ contentType: 'text/html', body: '<html>Cached old SPA response</html>' })
    }
    return route.continue()
  })
  await page.goto('/scores/yue_liang_dai_biao_wo_de_xin_01')
  await expect(page.locator('svg[data-engine="m3n"]')).toBeVisible()
  await expect(page.locator('.score-paper')).toContainText('月亮代表我的心')
  expect(scripts.length).toBeGreaterThan(0)
  expect(scripts.every(path => path.startsWith('/assets/v2/'))).toBe(true)
  expect(errors).toEqual([])
})
