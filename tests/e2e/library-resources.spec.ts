import { expect, test } from '@playwright/test'

test('library, reader and cancelled export share two packages and three TTFs', async ({ page }) => {
  const requests: string[] = []
  const errors: string[] = []
  page.on('request', request => { if (/\.(gz|ttf|woff2)(?:\?|$)/.test(request.url())) requests.push(request.url()) })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/scores')
  await expect.poll(() => requests.filter(url => url.endsWith('.gz')).length).toBe(2)
  await page.locator('a.score-card').filter({ hasText: '小星星' }).first().click()
  await expect(page.locator('svg[data-engine="m3n"]').first()).toBeVisible()
  const installed = await page.evaluate(() => [...document.fonts].map(font => ({ family: font.family, status: font.status })))
  expect(installed.some(font => font.family === 'Noto Sans SC' && font.status === 'loaded')).toBe(true)
  expect(requests.filter(url => /\.(ttf|woff2)$/.test(url))).toEqual([])
  await page.goBack()
  await expect(page.getByRole('button', { name: '导出全量谱集' })).toBeVisible()
  await page.getByRole('button', { name: '导出全量谱集' }).click()
  await expect(page.getByText('第 2/3 阶段：排版乐谱', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.locator('dialog')).toHaveCount(0)
  expect(requests.filter(url => url.endsWith('.gz'))).toHaveLength(2)
  expect(requests.filter(url => /\.(ttf|woff2)$/.test(url))).toEqual([])
  expect(errors).toEqual([])
})
