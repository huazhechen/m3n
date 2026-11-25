import { expect, test } from '@playwright/test'

test('a direct score link loads hashed modules directly from assets', async ({ page }) => {
  const scripts: string[] = [], errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    if (request.resourceType() === 'script') scripts.push(new URL(request.url()).pathname)
  })
  await page.goto('/scores/yue_liang_dai_biao_wo_de_xin_01')
  await expect(page.locator('svg[data-engine="m3n"]')).toBeVisible()
  await expect(page.locator('.score-paper')).toContainText('月亮代表我的心')
  expect(scripts.length).toBeGreaterThan(0)
  expect(scripts.every(path => /^\/assets\/[^/]+-[\w-]+\.js$/.test(path))).toBe(true)
  expect(errors).toEqual([])
})
