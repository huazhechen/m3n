import { expect, test } from '@playwright/test'

const source = '{title=本地测试}\n{key=C} {4/4} {120qpm}\nN: 1 2 3 4 |||'

test('browse saves locally and edit reuses the score id', async ({ page }) => {
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill(source)
  await page.getByRole('button', { name: '浏览' }).click()

  await expect(page).toHaveURL(/\/scores\/local-/)
  await expect(page.locator('.score-reader svg').first()).toBeVisible({ timeout: 30_000 })

  await page.getByRole('link', { name: '编辑' }).click()
  await expect(page).toHaveURL(/\/editor\/local-/)
  await expect(page.getByLabel('M3N source')).toHaveValue(source)
})

test('submit is simulated locally and opens the reader', async ({ page }) => {
  await page.goto('/editor')
  await expect(page.getByText('本地模拟提交')).toBeVisible()
  await page.getByLabel('M3N source').fill(source)
  await page.getByRole('button', { name: '提交' }).click()

  await expect(page).toHaveURL(/\/scores\/[a-z0-9_]+_[0-9]{13}/)
  await expect(page.locator('.score-reader svg').first()).toBeVisible({ timeout: 30_000 })
})

test('score library marks local scores, opens on click, and deletes', async ({ page }) => {
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill(source)
  await page.getByRole('button', { name: '浏览' }).click()
  await expect(page).toHaveURL(/\/scores\/local-/)

  await page.goto('/scores')
  const localCard = page.locator('.score-list .score-card', { hasText: '本地测试' })
  await expect(localCard).toBeVisible()
  await expect(localCard.locator('.score-card-marker')).toHaveText('本地')
  await expect(page.locator('.score-card-marker')).toHaveCount(1)
  await localCard.click()
  await expect(page).toHaveURL(/\/scores\/local-/)

  await page.goto('/scores')
  page.on('dialog', (dialog) => dialog.accept())
  const card = page.locator('.score-list .score-card', { hasText: '本地测试' })
  await card.getByRole('button', { name: '删除' }).click()
  await expect(card).toHaveCount(0)
})

test('library mixes local and built-in titles alphabetically and has no automatic ratings', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('m3n:local-scores', JSON.stringify(['Zzz 排序用例', 'Aaa 排序用例'].map((title, index) => ({
      id: `local-sort-${index}`,
      source: `{title=${title}} {4/4}\nN: 1 2 3 4 |||`,
      createdAt: new Date().toISOString(),
      expiresAt: Date.now() + 86_400_000,
    }))))
  })
  await page.goto('/scores')
  const titles = page.locator('.score-list .score-card h3')
  await expect(titles.first()).toHaveText('Aaa 排序用例')
  await expect(titles.last()).toHaveText('Zzz 排序用例')
  await expect(page.locator('.score-list')).not.toContainText('评分')
  await page.getByRole('searchbox', { name: '搜索乐谱' }).fill('排序用例')
  await expect(titles).toHaveText(['Aaa 排序用例', 'Zzz 排序用例'])
  await page.goto('/editor')
  await expect(page.getByRole('button', { name: '格式化', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '复杂度', exact: true })).toHaveCount(0)
})
