import { expect, test } from '@playwright/test'
import { scoreMetadataFromSource } from '@m3n/notation'

const source = '{title=独立测试作品}{key=C#}{4/4}\nN: 1 2 3 4 |||'
const works = ['work-one', 'work-two'].map((slug, index) => ({
  ...scoreMetadataFromSource(slug, source.replace('独立测试作品', `独立测试作品${index + 1}`)),
  sourceUrl: `assets/v2/${slug}.m3n`, sourcePath: `${slug}.m3n`, modifiedAt: index,
}))

test('unlisted collection has no public entry and an empty initial archive', async ({ page }) => {
  const requests: string[] = []
  page.on('request', request => requests.push(request.url()))
  await page.goto('/scores')
  await expect(page.locator('.score-card').first()).toBeVisible()
  await expect(page.locator('a[href*="/works"]')).toHaveCount(0)
  expect(requests.some(url => url.includes('works-catalog.json'))).toBe(false)
  await page.route('**/works-catalog.json', route => route.fulfill({ json: [] }))
  await page.goto('/works')
  await expect(page.getByRole('heading', { name: '独立作品' })).toBeVisible()
  await expect(page.getByText('暂无独立作品。')).toBeVisible()
  await expect(page.getByRole('button', { name: '导出全量谱集' })).toHaveCount(0)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
  await page.getByRole('link', { name: 'M3N', exact: true }).click()
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
  await expect(page.locator('a[href*="/works"]')).toHaveCount(0)
})

test('works support search, isolated navigation, direct reading, export and editing', async ({ page }) => {
  await page.route('**/works-catalog.json', route => route.fulfill({ json: works }))
  await page.route('**/assets/v2/work-*.m3n', route => route.fulfill({ contentType: 'text/plain', body: source }))
  await page.goto('/works')
  await expect(page.locator('.score-card')).toHaveCount(2)
  await page.getByRole('searchbox').fill('作品2')
  await expect(page.locator('.score-card')).toHaveCount(1)
  await page.locator('.score-card').click()
  await expect(page).toHaveURL(/\/works\/work-two$/)
  await expect(page.locator('.score-reader svg').first()).toBeVisible()
  await expect(page.getByRole('link', { name: '上一曲', exact: true })).toHaveAttribute('href', '/works/work-one')
  await expect(page.getByRole('link', { name: '下一曲', exact: true })).toHaveAttribute('aria-disabled', 'true')
  await page.getByRole('link', { name: '上一曲', exact: true }).click()
  await expect(page.locator('.score-reader svg').first()).toBeVisible()
  await page.reload()
  await expect(page.locator('.score-reader svg').first()).toBeVisible()
  await page.getByRole('button', { name: '打印', exact: true }).click()
  await expect(page.getByRole('button', { name: 'PDF', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: '编辑', exact: true }).click()
  await expect(page).toHaveURL(/\/works\/work-one\/edit$/)
  await expect(page.locator('.cm-content')).toContainText('独立测试作品')
  await page.goto('/scores/work-one')
  await expect(page.getByRole('alert')).toContainText('乐谱不存在')
  await page.goto('/works/huan_le_song_01')
  await expect(page.getByRole('alert')).toContainText('乐谱不存在')
  await expect(page.getByRole('link', { name: '返回独立作品' })).toHaveAttribute('href', '/works')
})

test('a failed works catalog can be retried', async ({ page }) => {
  let attempts = 0
  await page.route('**/works-catalog.json', route => {
    attempts += 1
    return attempts === 1 ? route.fulfill({ status: 503, body: 'unavailable' }) : route.fulfill({ json: works })
  })
  await page.goto('/works')
  await expect(page.getByRole('alert')).toContainText('独立作品加载失败')
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.locator('.score-card')).toHaveCount(2)
})
