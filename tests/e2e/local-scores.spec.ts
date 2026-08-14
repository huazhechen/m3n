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

  await expect(page).toHaveURL(/\/scores\/[a-z0-9]+_[0-9]{13}/)
  await expect(page.locator('.score-reader svg').first()).toBeVisible({ timeout: 30_000 })
})

test('score library shows and deletes local scores', async ({ page }) => {
  await page.goto('/editor')
  await page.getByLabel('M3N source').fill(source)
  await page.getByRole('button', { name: '浏览' }).click()
  await expect(page).toHaveURL(/\/scores\/local-/)

  await page.goto('/scores')
  const card = page.locator('.local-score-card')
  await expect(card).toContainText('本地测试')
  await card.getByRole('link', { name: '查看' }).click()
  await expect(page).toHaveURL(/\/scores\/local-/)

  await page.goto('/scores')
  page.on('dialog', (dialog) => dialog.accept())
  await page.locator('.local-score-card').getByRole('button', { name: '删除' }).click()
  await expect(page.locator('.local-score-card')).toContainText('暂无本地乐谱')
})
