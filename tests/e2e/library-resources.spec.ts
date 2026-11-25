import { expect, test } from '@playwright/test'

for (const delayed of ['scores.json.gz', 'score-fonts.bin.gz']) {
  test(`library keeps loading until ${delayed} is ready`, async ({ page }) => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const requests: string[] = []
    page.on('request', request => { if (request.url().endsWith('.gz')) requests.push(request.url()) })
    await page.route(`**/*-${delayed}`, async route => {
      await gate
      await route.continue()
    })
    try {
      await page.goto('/scores')
      await expect.poll(() => requests.length).toBe(2)
      const loading = page.getByRole('button', { name: '正在加载乐谱和字体' })
      await expect(loading).toBeDisabled()
      await expect(loading).toHaveAttribute('aria-busy', 'true')
      await expect(loading.locator('svg')).toHaveCSS('animation-name', 'nav-loading-spin')
      await page.getByRole('searchbox', { name: '搜索乐谱' }).fill('小星星')
      await expect(page.locator('a.score-card').first()).toContainText('小星星')
      release()
      await expect(page.getByRole('button', { name: '导出全量谱集' })).toBeEnabled()
      expect(await page.evaluate(() => [...document.fonts].filter(font => font.status === 'loaded').length)).toBeGreaterThanOrEqual(3)
      expect(requests).toHaveLength(2)
    } finally { release() }
  })
}

test('library retries a failed package before enabling export', async ({ page }) => {
  let sources = 0, fonts = 0
  page.on('request', request => { if (request.url().endsWith('-score-fonts.bin.gz')) fonts++ })
  await page.route('**/*-scores.json.gz', async route => {
    sources++
    if (sources === 1) await route.fulfill({ status: 503, body: 'Unavailable' })
    else await route.continue()
  })
  await page.goto('/scores')
  await page.getByRole('button', { name: '加载失败，点击重试' }).click()
  await expect(page.getByRole('button', { name: '导出全量谱集' })).toBeEnabled()
  expect(sources).toBe(2)
  expect(fonts).toBe(1)
})

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
  await page.getByRole('button', { name: '简谱', exact: true }).click()
  await expect(page.getByText('第 2/3 阶段：排版乐谱', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.locator('dialog')).toHaveCount(0)
  expect(requests.filter(url => url.endsWith('.gz'))).toHaveLength(2)
  expect(requests.filter(url => /\.(ttf|woff2)$/.test(url))).toEqual([])
  expect(errors).toEqual([])
})
